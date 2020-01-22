## getMTBS - Retrieve [MTBS](https://www.mtbs.gov/) data for a given state and a publication year

This utility pulls wildfire severity data from [MTBS](https://www.mtbs.gov/). The data is used to populate the [OregonHOWL](https://oregonhowl.org/?view=wildfires) History of Wildfire Severity spotlight.

**NOTE:** This utility requires the command "zip" to be available in the system (standard in [macOS](https://ss64.com/osx/zip.html) and [Linux](https://ss64.com/bash/zip.html))

```
Usage:
  getMTBS.js [OPTIONS] [ARGS]

Options:
  -s, --state [STRING]   State (Default is OR)
  -y, --year [STRING]    Year (Default is 2017)
  -d, --dest [FILE]      Destination directory (Default is MTBS)
  -l, --log [STRING]     Log level (Default is info)
  -m, --max [NUMBER]     Max number of records (for debug only) (Default is Infinity)
  -h, --help             Display help and usage details
```
#### Examples:

```
node getMTBS.js
```

Gets data for all wildfires reported in the state of Oregon from 1984 to 2017. The list of wildfires will be saved in the ```./MTBS``` directory in geojson as ```MTBS.json```. In addition, under ```./MTBS/kmz/``` there will be a .kmz file for every wildfire which includes an image overlay with the result of the fire severity analysis conducted by MTBS.

```
node getMTBS.js -s ID -d MTBS_ID
```

Gets data for all wildfires reported in the state of Idaho from 1984 to 2017. The list of wildfires will be saved in the ```./MTBS_ID``` directory in geojson as ```MTBS.json```. In addition, under ```./MTBS/kmz/``` there will be a .kmz file for every wildfire which includes an image overlay with the result of the fire severity analysis conducted by MTBS.
