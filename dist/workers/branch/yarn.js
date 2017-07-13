let generateLockFile = (() => {
  var _ref = _asyncToGenerator(function* (newPackageJson, npmrcContent, yarnrcContent, cacheFolder) {
    logger.debug('Generating new yarn.lock file');
    const tmpDir = tmp.dirSync({ unsafeCleanup: true });
    let yarnLock;
    try {
      fs.writeFileSync(path.join(tmpDir.name, 'package.json'), newPackageJson);
      if (npmrcContent) {
        fs.writeFileSync(path.join(tmpDir.name, '.npmrc'), npmrcContent);
      }
      if (yarnrcContent) {
        fs.writeFileSync(path.join(tmpDir.name, '.yarnrc'), yarnrcContent);
      }
      logger.debug('Spawning yarn install');
      const yarnOptions = ['install'];
      if (cacheFolder && cacheFolder.length) {
        logger.debug(`Setting yarn cache folder to ${cacheFolder}`);
        yarnOptions.push(`--cache-folder ${cacheFolder}`);
      }
      const result = cp.spawnSync('yarn', yarnOptions, {
        cwd: tmpDir.name,
        shell: true
      });
      logger.debug(String(result.stdout));
      logger.debug(String(result.stderr));
      yarnLock = fs.readFileSync(path.join(tmpDir.name, 'yarn.lock'));
    } catch (error) /* istanbul ignore next */{
      try {
        tmpDir.removeCallback();
      } catch (err2) {
        logger.warn(`Failed to remove tmpDir ${tmpDir.name}`);
      }
      throw error;
    }
    try {
      tmpDir.removeCallback();
    } catch (err2) {
      logger.warn(`Failed to remove tmpDir ${tmpDir.name}`);
    }
    return yarnLock;
  });

  return function generateLockFile(_x, _x2, _x3, _x4) {
    return _ref.apply(this, arguments);
  };
})();

let getLockFile = (() => {
  var _ref2 = _asyncToGenerator(function* (packageFile, packageContent, api, cacheFolder, yarnVersion) {
    // Detect if a yarn.lock file is in use
    const yarnLockFileName = path.join(path.dirname(packageFile), 'yarn.lock');
    if (!(yield api.getFileContent(yarnLockFileName))) {
      return null;
    }
    if (yarnVersion === '') {
      throw new Error(`Need to generate yarn.lock but yarn is not installed`);
    }
    // Copy over custom config commitFiles
    const npmrcContent = yield api.getFileContent('.npmrc');
    const yarnrcContent = yield api.getFileContent('.yarnrc');
    // Generate yarn.lock using shell command
    const newYarnLockContent = yield module.exports.generateLockFile(packageContent, npmrcContent, yarnrcContent, cacheFolder);
    // Return file object
    return {
      name: yarnLockFileName,
      contents: newYarnLockContent
    };
  });

  return function getLockFile(_x5, _x6, _x7, _x8, _x9) {
    return _ref2.apply(this, arguments);
  };
})();

let maintainLockFile = (() => {
  var _ref3 = _asyncToGenerator(function* (inputConfig) {
    logger.trace({ config: inputConfig }, `maintainLockFile`);
    const packageContent = yield inputConfig.api.getFileContent(inputConfig.packageFile);
    const yarnLockFileName = path.join(path.dirname(inputConfig.packageFile), 'yarn.lock');
    logger.debug(`Checking for ${yarnLockFileName}`);
    let existingYarnLock = yield inputConfig.api.getFileContent(yarnLockFileName, inputConfig.branchName);
    if (!existingYarnLock) {
      existingYarnLock = yield inputConfig.api.getFileContent(yarnLockFileName);
    }
    logger.trace(`existingYarnLock:\n${existingYarnLock}`);
    if (!existingYarnLock) {
      return null;
    }
    logger.debug('Found existing yarn.lock file');
    const newYarnLock = yield module.exports.getLockFile(inputConfig.packageFile, packageContent, inputConfig.api, inputConfig.yarnCacheFolder);
    logger.trace(`newYarnLock:\n${newYarnLock.contents}`);
    if (existingYarnLock.toString() === newYarnLock.contents.toString()) {
      logger.debug('Yarn lock file does not need updating');
      return null;
    }
    logger.debug('Yarn lock needs updating');
    return newYarnLock;
  });

  return function maintainLockFile(_x10) {
    return _ref3.apply(this, arguments);
  };
})();

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const logger = require('../../logger');
const fs = require('fs');
const cp = require('child_process');
const tmp = require('tmp');
const path = require('path');

module.exports = {
  generateLockFile,
  getLockFile,
  maintainLockFile
};