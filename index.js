const puppeteer = require('puppeteer')
const fs = require('fs')
const path = require('path')
const download = require('download')
const decompress = require('decompress')

const downloadPath = './download'
const decompressedPath = './decompressed'

if (!fs.existsSync(downloadPath)) {
  fs.mkdirSync(downloadPath)
}

const getListOfPaths = async () => {
  const TARGET_URL = 'https://cartografia.ife.org.mx/sige7/?mapoteca=catalogo&CM'
  const browser = await puppeteer.launch()
  const page = await browser.newPage()

  await page.setViewport({
    width: 1920,
    height: 1080
  })

  await page.goto(TARGET_URL, {
    waitUntil: 'networkidle2'
  })

  const result = await page.evaluate(() => {
    const options = [...document.querySelectorAll('#mapo-entidad > *')].map(option => {
      return {
        name: option.innerText,
        value: option.value
      }
    })
      .filter(elem => elem.value !== '0')

    return options
  })

  const notDownloadValue = '0'
  const listOfPaths = []

  for (const elem of result) {
    const { name, value } = elem
    const dropdownSelector = '#mapo-entidad'
    const downloadButtonSelector = '#area-mapoteca-boton a'

    await page.select(dropdownSelector, notDownloadValue)
    await page.waitForSelector(downloadButtonSelector, { hidden: true })
    await page.select(dropdownSelector, value)
    await page.waitForSelector(downloadButtonSelector, { hidden: false })

    const url = await page.evaluate((downloadButtonSelector) => {
      const downloadButton = document.querySelector(downloadButtonSelector)
      return downloadButton.href
    }, downloadButtonSelector)
    listOfPaths.push({ url, name })
  }

  await browser.close()

  return listOfPaths
}

const downloadZip = async () => {
  const directoryPath = path.join(__dirname, 'download')
  const listOfPaths = await getListOfPaths()

  for (const path of listOfPaths) {
    const { url } = path
    await download(url, directoryPath)
  }
}

const unzip = async () => {
  try {
    if (!fs.existsSync(decompressedPath)) {
      fs.mkdirSync(decompressedPath)
    }
    const directoryPath = path.join(__dirname, 'download')

    const listOfPathFromDownload = fs.readdirSync(directoryPath).map(zipPath => {
      const zipFolder = path.join(__dirname, 'download', zipPath)
      return zipFolder
    })

    let index = 0
    for (const zipPath of listOfPathFromDownload) {
      await decompress(zipPath, 'decompressed', {
        map: file => {
          file.path = `mx-${index + 1}-${file.path}`
          return file
        }
      })
      index++
    }

    const isTxtFile = (path) => {
      const txtRegex = /\.txt$/i
      return txtRegex.test(path)
    }
    const directoryPath2 = path.join(__dirname, 'decompressed')
    const listOfDecompressed = fs.readdirSync(directoryPath2).map(decompressed => {
      const decompressedFolder = path.join(__dirname, 'decompressed', decompressed)
      return decompressedFolder
    })

    for (const decompressedFilePath of listOfDecompressed) {
      if (!isTxtFile(decompressedFilePath)) {
        fs.unlinkSync(decompressedFilePath)
      }
    }

    const listOfTxt = fs.readdirSync(directoryPath2).map(decompressed => {
      const decompressedFolder = path.join(__dirname, 'decompressed', decompressed)
      return decompressedFolder
    })

    const getStateAndMunicipalities = (listOfStateWithMunicipalities) => {
      if (!listOfStateWithMunicipalities.length) return null
      const SEPARATOR_CHARACTER = '|'
      const [stateCode, stateName] = listOfStateWithMunicipalities[0].split(SEPARATOR_CHARACTER)
      const municipalities = listOfStateWithMunicipalities.map(stateAndMunicipality => {
        const [, , municipalityCode, municipalityName] = stateAndMunicipality.split(SEPARATOR_CHARACTER)
        const municipalityCodeFormatted = municipalityCode.length === 1
          ? `00${municipalityCode}`
          : municipalityCode.length === 2
            ? `0${municipalityCode}`
            : municipalityCode

        return {
          name: municipalityName,
          code: municipalityCodeFormatted
        }
      })

      return { stateCode, stateName, municipalities }
    }

    const statesAndMunicipalities = {}

    for (const txt of listOfTxt) {
      const binaryText = fs.readFileSync(txt)
      const municipalitiesCodeAndName = []
      binaryText.toString().split(/\n/).forEach(function (line) {
        const formattedLine = line.trim().replace(/(\r\n|\n|\r)/gm, '')
        municipalitiesCodeAndName.push(formattedLine)
      })
      const municipalitiesCodeAndNameWithoutHeaders = municipalitiesCodeAndName.slice(1).filter(line => line !== '')
      const { stateCode, stateName, municipalities } = getStateAndMunicipalities(municipalitiesCodeAndNameWithoutHeaders)
      statesAndMunicipalities[stateCode] = {
        name: stateName,
        municipalities
      }
    }
    return statesAndMunicipalities
  } catch (err) {
    console.log(err)
  }
}

const writeData = (data) => {
  fs.writeFileSync('./data.json', JSON.stringify(data, null, 2), 'utf-8')
}

const cleanUp = () => {
  fs.rmSync('./decompressed', { recursive: true, force: true })
  fs.rmSync('./download', { recursive: true, force: true })
}

;(() => {
  downloadZip().then(() => {
    unzip().then(data => {
      writeData(data)
      cleanUp()
    })
  })
})()
