# ioBroker.ryd

[![NPM version](http://img.shields.io/npm/v/iobroker.ryd.svg)](https://www.npmjs.com/package/iobroker.ryd)
[![Downloads](https://img.shields.io/npm/dm/iobroker.ryd.svg)](https://www.npmjs.com/package/iobroker.ryd)
[![Dependency Status](https://img.shields.io/david/NemoN/iobroker.ryd.svg)](https://david-dm.org/NemoN/iobroker.ryd)
[![Known Vulnerabilities](https://snyk.io/test/github/NemoN/ioBroker.ryd/badge.svg)](https://snyk.io/test/github/NemoN/ioBroker.ryd)

[![NPM](https://nodei.co/npm/iobroker.ryd.png?downloads=true)](https://nodei.co/npm/iobroker.ryd/)

**Tests:**: [![Travis-CI](http://img.shields.io/travis/NemoN/ioBroker.ryd/master.svg)](https://travis-ci.org/NemoN/ioBroker.ryd)

## Ryd adapter for ioBroker

[Ryd](https://de.ryd.one/) (previously known as *TankTaler*) ODB2 Adapter

## Important notice

This adapter does *not* use the official API, there may be problems/side effects in the official Ryd app. Please do not open Ryd support tickets in this case.

## Known problems
* *Problem:* Adapter not start, error message: `error: host.ioBrokerVM instance system.adapter.ryd.0 terminated with code 1 ()`
* *Solution:* The Adapter needs at least NodeJS **8.x**, NodeJS 6.x and lower will not work

## Changelog

### 0.3.5 (2021-11-24)
* (92lleo) Reuse auth token

### 0.3.4 (2021-11-12)
* (NemoN) Optimize user/token handling

### 0.3.3 (2020-09-10)
* (NemoN) Cleanup some internal functions

### 0.3.1 (2019-07-18)
* (NemoN) Cleanup some internal functions

### 0.3.0 (2019-07-17)
* (NemoN) First open beta release

### 0.2.1 (2019-07-16)
* (NemoN) Configuration of internal parameters

### 0.2.0 (2019-07-15)
* (NemoN) Beta release

### 0.0.1
* (NemoN) Initial release

## License
MIT License

Copyright (c) 2021 Thomas Oeding

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
