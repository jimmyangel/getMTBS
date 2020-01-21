'use strict'

const fs = require('fs-extra')

const cli = require('cli')
const log = require('simple-node-logger').createSimpleLogger()
const axios = require('axios')

const unzipper = require('unzipper')
const shapefile = require('shapefile')
const ThrottledPromise = require('throttled-promise')
const exec = require('util').promisify(require('child_process').exec)

const MAX_PROMISES = 5

const options = cli.parse({
    state: ['s', 'State', 'string', 'OR'],
    year: ['y', 'Year', 'string', '2017'],
    dest: ['d', 'Destination directory', 'file', 'MTBS'],
    log: ['l', 'Log level', 'string', 'info'],
    max: ['m', 'Max number of records (for debug only)', 'int', Infinity],
    help: ['h', 'Display help and usage details']
});

if (options.help) {
  console.log('getMTBS - Get MTBS data\n')
  cli.getUsage()
} else {
  log.setLevel(options.log)
  doGetMTBS(options.dest, options.year, options.state, options.max)
}

function doGetMTBS (path, year, state, max) {
  log.info(`Getting MTBS data for ${state} as of ${year}`)

  fs.removeSync('./' + path + '/kmz')

  retrieveMTBSListOfFires(year, state).then((MTBSListOfFires) => {
    let p = []
    for (let [i, fire] of MTBSListOfFires.entries()) {
      if (i === max) break; // Temporary limit
      p.push(new ThrottledPromise((resolve, reject) => {
        retrieveMTBSDetails(fire.year, fire.fireId, path).then(MTBSDetails => {
          resolve(MTBSDetails)
        }).catch(error => {
          return reject(error)
        })
      }))
    }
    ThrottledPromise.all(p, MAX_PROMISES).then(values => {
      let destination = './' + path + '/' + 'MTBS.json'
      fs.outputFile(destination, JSON.stringify(buildFeatureCollection(values), null, 2)).then(() => {
        log.info('Process complete: ' + destination + ' generated')
      }).catch(error => {
        log.fatal(error)
      })
    }).catch(error => {
      log.fatal(error)
    })
  }).catch(error => {
    log.fatal(error)
  })
}

function retrieveMTBSListOfFires(year, state) {
  let MTBSUrl = 'https://edcintl.cr.usgs.gov/geoserver/mtbs/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=mtbs:mtbs_fire_polygons_' +
    year + '&propertyName=fire_id,year&outputFormat=json&CQL_FILTER=fire_id%20LIKE%20%27' + state + '%25%27'
  let listData = []
  return new Promise((resolve, reject) => {
    axios.get(MTBSUrl).then(response => {
      response.data.features.forEach(f => {
        listData.push({year: f.properties.year, fireId: f.properties.fire_id})
      })
      resolve(listData)
    }).catch(error => {
      return reject(error)
    })
  })
}

function retrieveMTBSDetails(year, fireId, path) {
  let MTBSUrl = 'https://edcintl.cr.usgs.gov/downloads/sciweb1/shared/MTBS_Fire/data/' + year + '/fire_level_tar_files/' + fireId.toLowerCase() + '.zip'

  return new Promise((resolve, reject) => {
    axios.get(MTBSUrl, { responseType: 'arraybuffer' }).then(response => {
      log.info(`Processing ${fireId}`)
      unzipper.Open.buffer(response.data).then(directory => {
        let p = []
        let files = directory.files.filter(d => d.path.includes('_desc.dbf') || d.path.includes('_rep.dbf'))
        files.forEach(file => {
          p.push(xtractDbfFile(file))
        })

        Promise.all(p).then(dbfFiles => {
          let p = []
          dbfFiles.forEach(dbfFile => {
            p.push(getDbfRecords(dbfFile.dbf, dbfFile.content))
          })
          Promise.all(p).then(dbfRecordsArray => {
            let feature = buildFeature(dbfRecordsArray)
            if (feature) {
              // Grab the kmz
              let kmzFile = directory.files.find(d => d.path.endsWith('.kmz'))
              feature.properties.kmzLink = '/' + kmzFile.path
              processKmzFile(kmzFile, './' + path + '/kmz' + feature.properties.kmzLink).then(() => {
                log.debug(`kmz file ${kmzFile.path} xtracted`)
              }).catch(error => {
                log.fatal(error)
                return reject(error)
              })
              resolve(feature)
            } else {
              return reject('Invalid dbfRecordsArray')
            }
          })
        })

      })
    })
  })
}

function xtractDbfFile(file) {
  return new Promise((resolve, reject) => {
    file.buffer().then(content => {
      resolve({
        dbf: file.path.substring(file.path.lastIndexOf('_')+1, file.path.lastIndexOf('.')),
        content: content
      })
    })
  })
}

function getDbfRecords(dbf, entry) {

  return new Promise((resolve, reject) => {
    let dbfRecords = {}
    dbfRecords[dbf] = []
    shapefile.openDbf(entry)
      .then(source => source.read()
        .then(function log(result) {
          if (result.done) {
            resolve(dbfRecords)
            return
          }
          dbfRecords[dbf].push(result.value);
          return source.read().then(log)
        }))
      .catch(error => log.fatal(error.stack))
    })
}

function buildFeature(dbfRecordsArray) {
  if (dbfRecordsArray.length != 2) return false

  let feature = {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Point',
      coordinates: []
    }
  }

  dbfRecordsArray.forEach((item, i) => {
    if (item.desc) { // desc record
      feature.properties.id = item.desc[0].FIRE_ID
      feature.properties.name = item.desc[0].FIRENAME
      feature.properties.hydrologicUnit = item.desc[0].HUC4_NAME
      feature.properties.acres = item.desc[0].R_ACRES
      feature.properties.ignitionDate = new Date(item.desc[0].FIRE_YEAR, item.desc[0].FIRE_MON-1, item.desc[0].FIRE_DAY)
      feature.properties.severityUnburnedAcres = item.desc[0].CLS1_ACRES
      feature.properties.severityLowAcres = item.desc[0].CLS2_ACRES
      feature.properties.severityModerateAcres = item.desc[0].CLS3_ACRES
      feature.properties.severityHighAcres = item.desc[0].CLS4_ACRES
      feature.properties.severityIncreasedGreenesAcres = item.desc[0].CLS5_ACRES
      feature.properties.nonProcessingMaskAcres = item.desc[0].CLS6_ACRES
      feature.properties.kmzLink = 'nothing for now'
      feature.geometry.coordinates = [item.desc[0].LONG, item.desc[0].LAT]

    } else { // rep record
      let forestAcres = 0
      item.rep.forEach(function(r) {
        if (r.NLCD_L1_DE === 'Forest') {
          forestAcres += r.R_ACRES
        }
      })
      feature.properties.forestAcres = Number(forestAcres.toFixed(2))
    }
  });
  return feature
}

function buildFeatureCollection (features) {
  let featureCollection = {
    type: 'FeatureCollection',
    features: []
  }

  let maxAcres = Math.max.apply(Math, features.map(function(o){return o.properties.acres}))
  let minAcres = Math.min.apply(Math, features.map(function(o){return o.properties.acres}))
  features = features.map(function(item) {
    item.properties.relativeArea = Number(((item.properties.acres - minAcres) / (maxAcres - minAcres)).toFixed(5))
    return item
  })
  featureCollection.features = features;
  featureCollection.features = features.sort(function(a, b) {
    return (new Date(a.properties.ignitionDate).getTime() - (new Date(b.properties.ignitionDate)).getTime())
  })
  return featureCollection
}

function processKmzFile (kmzFile, destination) {
  return new Promise((resolve, reject) => {
    kmzFile.buffer().then(content => {
      fs.outputFile(destination, content).then(() => {
        exec(`zip -d ${destination} *_refl.png`).then(() => {
          resolve()
        }).catch(error => {
          return reject (error)
        })
      }).catch(error => {
        return reject('Kmz file write error')
      })
    })
  })
}
