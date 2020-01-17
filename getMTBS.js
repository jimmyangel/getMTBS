'use strict'

const fs = require('fs')

const cli = require('cli')
const log = require('simple-node-logger').createSimpleLogger()
const axios = require('axios')
const xml2js = require('xml2js')

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
  let MTBSUrl = 'https://edcintl.cr.usgs.gov/geoserver/mtbs/ows?service=WFS&version=2.0.0&request=GetPropertyValue&typeName=mtbs:mtbs_fire_polygons_' +
    year + '&valueReference=fire_id&&outputFormat=csv&CQL_FILTER=fire_id%20LIKE%20%27' + state + '%25%27'
  log.info(`Getting MTBS data for ${state} as of ${year}`)

  retrieveMTBSListOfFires(year, state).then((MTBSListOfFires) => {
    console.log(MTBSListOfFires)
  }).catch(error => {
    console.log(error)
  })
}

function retrieveMTBSListOfFires(year, state) {
  let MTBSUrl = 'https://edcintl.cr.usgs.gov/geoserver/mtbs/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=mtbs:mtbs_fire_polygons_' +
    year + '&propertyName=fire_id,year&outputFormat=json&CQL_FILTER=fire_id%20LIKE%20%27' + state + '%25%27'
  let listData = []
  return new Promise(function(resolve, reject) {
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
