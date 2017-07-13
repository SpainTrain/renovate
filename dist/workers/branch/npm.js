let generateLockFile = (() => {
  var _ref = _asyncToGenerator(function* (newPackageJson, npmrcContent) {
    logger.debug('Generating new package-lock.json file');
    const tmpDir = tmp.dirSync({ unsafeCleanup: true });
    let packageLock;
    try {
      fs.writeFileSync(path.join(tmpDir.name, 'package.json'), newPackageJson);
      if (npmrcContent) {
        fs.writeFileSync(path.join(tmpDir.name, '.npmrc'), npmrcContent);
      }
      logger.debug('Spawning npm install');
      const result = cp.spawnSync('npm', ['install'], {
        cwd: tmpDir.name,
        shell: true
      });
      logger.debug(String(result.stdout));
      logger.debug(String(result.stderr));
      packageLock = fs.readFileSync(path.join(tmpDir.name, 'package-lock.json'));
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
    return packageLock;
  });

  return function generateLockFile(_x, _x2) {
    return _ref.apply(this, arguments);
  };
})();

let getLockFile = (() => {
  var _ref2 = _asyncToGenerator(function* (packageFile, packageContent, api, npmVersion) {
    // Detect if a package-lock.json file is in use
    const packageLockFileName = path.join(path.dirname(packageFile), 'package-lock.json');
    if (!(yield api.getFileContent(packageLockFileName))) {
      return null;
    }
    if (npmVersion === '') {
      throw new Error('Need to generate package-lock.json but npm is not installed');
    }
    // TODO: have a more forwards-compatible check
    if (npmVersion[0] !== '5') {
      throw new Error(`Need to generate package-lock.json but npm version is "${npmVersion}"`);
    }
    // Copy over custom config commitFiles
    const npmrcContent = yield api.getFileContent('.npmrc');
    // Generate package-lock.json using shell command
    const newPackageLockContent = yield module.exports.generateLockFile(packageContent, npmrcContent);
    // Return file object
    return {
      name: packageLockFileName,
      contents: newPackageLockContent
    };
  });

  return function getLockFile(_x3, _x4, _x5, _x6) {
    return _ref2.apply(this, arguments);
  };
})();

let maintainLockFile = (() => {
  var _ref3 = _asyncToGenerator(function* (inputConfig) {
    logger.trace({ config: inputConfig }, `maintainLockFile`);
    const packageContent = yield inputConfig.api.getFileContent(inputConfig.packageFile);
    const packageLockFileName = path.join(path.dirname(inputConfig.packageFile), 'package-lock.json');
    logger.debug(`Checking for ${packageLockFileName}`);
    const existingPackageLock = yield inputConfig.api.getFileContent(packageLockFileName);
    logger.trace(`existingPackageLock:\n${existingPackageLock}`);
    if (!existingPackageLock) {
      return null;
    }
    logger.debug('Found existing package-lock.json file');
    const newPackageLock = yield module.exports.getLockFile(inputConfig.packageFile, packageContent, inputConfig.api);
    logger.trace(`newPackageLock:\n${newPackageLock.contents}`);
    if (existingPackageLock.toString() === newPackageLock.contents.toString()) {
      logger.debug('npm lock file does not need updating');
      return null;
    }
    logger.debug('npm lock needs updating');
    return newPackageLock;
  });

  return function maintainLockFile(_x7) {
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