#!/usr/bin/env node
/*eslint-env node */

var
	redbird = require('../'),
  program = require('commander'),
  mkdirp = require('mkdirp'),
  pkg = require('../package.json'),
  version = pkg.version,
  path = require('path'),
  fs = require('fs'),
  _ = require('lodash');

/*
program
  .version(version)
  .usage('[options] path')
  .option('-c, --static', 'create a static app without server component')
  .option('-s, --sessions', 'add session support NOT IMPLEMENTED YET')
  .option('-r, --rights', 'add rights management support NOT IMPLEMENTED YET')
  .option('-a, --addon', 'create an Add-On NOT IMPLEMENTED YET')
  .option('-b, --verbose', 'show useful information')
  .option('-f, --force', 'force on non-empty directory')
  .parse(process.argv);

*/

var proxy = redbird();




