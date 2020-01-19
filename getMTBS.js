'use strict'

const cli = require('cli')
const log = require('simple-node-logger').createSimpleLogger()
const axios = require('axios')

const unzipper = require('unzipper')
const shapefile = require('shapefile')
const ThrottledPromise = require('throttled-promise')

const MAX_PROMISES = 5

const options = cli.parse({
    state: ['s', 'State', 'string', 'OR'],
    year: ['y', 'Year', 'string', '2017'],
    dest: ['d', 'Destination directory', 'file', 'MTBS'],
    help: ['h', 'Display help and usage details']
});

if (options.help) {
  console.log('getMTBS - Get MTBS data\n')
  cli.getUsage()
} else {
  doGetMTBS(options.dest, options.year, options.state)
}

function doGetMTBS (path, year, state) {
  log.info(`Getting MTBS data for ${state} as of ${year}`)

  retrieveMTBSListOfFires(year, state).then((MTBSListOfFires) => {

    let dp
    let p = []

    for (var i = 0; i < 3; i++) {
    //for (var i = 0; i < MTBSListOfFires.length; i++) {

      (function (i) {
        dp = new ThrottledPromise((resolve, reject) => {
          retrieveMTBSDetails(MTBSListOfFires[i].year, MTBSListOfFires[i].fireId).then(MTBSDetails => {
            resolve(MTBSDetails)
          })
        })
      })(i)

      p.push(dp)
    }
    ThrottledPromise.all(p, MAX_PROMISES).then(values => {
      console.log(values)
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

function retrieveMTBSDetails(year, fireId) {
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
            console.log(dbfRecordsArray)
            resolve(dbfRecordsArray)
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
            //console.log(dbfRecords)
            resolve(dbfRecords)
            return
          }
          dbfRecords[dbf].push(result.value);
          return source.read().then(log)
        }))
      .catch(error => console.error(error.stack))
    })
}
