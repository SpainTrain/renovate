let getParentBranch = (() => {
  var _ref = _asyncToGenerator(function* (branchName, config) {
    // Check if branch exists
    if ((yield config.api.branchExists(branchName)) === false) {
      logger.info(`Branch needs creating`);
      return undefined;
    }
    logger.info(`Branch already exists`);
    // Check if needs rebasing
    if (config.rebaseStalePrs || config.automergeEnabled && config.automergeType === 'branch-push') {
      const isBranchStale = yield config.api.isBranchStale(branchName);
      if (isBranchStale) {
        logger.info(`Branch is stale and needs rebasing`);
        return undefined;
      }
    }

    // Check for existing PR
    const pr = yield config.api.getBranchPr(branchName);
    // Decide if we need to rebase
    if (!pr) {
      logger.debug(`No PR found`);
      // We can't tell if this branch can be rebased so better not
      return branchName;
    }
    if (pr.isUnmergeable) {
      logger.debug('PR is unmergeable');
      if (pr.canRebase) {
        logger.info(`Branch is not mergeable and needs rebasing`);
        if (config.isGitLab) {
          logger.info(`Deleting unmergeable branch in order to recreate/rebase`);
          yield config.api.deleteBranch(branchName);
        }
        // Setting parentBranch back to undefined means that we'll use the default branch
        return undefined;
      }
      // Don't do anything different, but warn
      logger.warn(`Branch is not mergeable but can't be rebased`);
    }
    logger.debug(`Branch does not need rebasing`);
    return branchName;
  });

  return function getParentBranch(_x, _x2) {
    return _ref.apply(this, arguments);
  };
})();

// Ensure branch exists with appropriate content


let ensureBranch = (() => {
  var _ref2 = _asyncToGenerator(function* (config) {
    logger.trace({ config }, 'ensureBranch');
    // Use the first upgrade for all the templates
    const branchName = handlebars.compile(config.branchName)(config);
    // parentBranch is the branch we will base off
    // If undefined, this will mean the defaultBranch
    const parentBranch = yield module.exports.getParentBranch(branchName, config);

    const commitMessage = handlebars.compile(config.commitMessage)(config);
    const api = config.api;
    const versions = config.versions;
    const cacheFolder = config.yarnCacheFolder;
    const packageFiles = {};
    const commitFiles = [];
    for (const upgrade of config.upgrades) {
      if (upgrade.type === 'lockFileMaintenance') {
        logger.debug('branch lockFileMaintenance');
        try {
          if (upgrade.hasYarnLock) {
            const newYarnLock = yield yarn.maintainLockFile(upgrade);
            if (newYarnLock) {
              commitFiles.push(newYarnLock);
            }
          }
          if (upgrade.hasPackageLock) {
            const newPackageLock = yield npm.maintainLockFile(upgrade);
            if (newPackageLock) {
              commitFiles.push(newPackageLock);
            }
          }
        } catch (err) {
          logger.debug(JSON.stringify(err));
          throw new Error('Error maintaining lock files');
        }
      } else {
        // See if this is the first time editing this file
        if (!packageFiles[upgrade.packageFile]) {
          // If we are rebasing then existing content will be from master
          packageFiles[upgrade.packageFile] = yield api.getFileContent(upgrade.packageFile, parentBranch);
        }
        const newContent = packageJsonHelper.setNewValue(packageFiles[upgrade.packageFile], upgrade.depType, upgrade.depName, upgrade.newVersion, logger);
        if (packageFiles[upgrade.packageFile] === newContent) {
          logger.debug('packageFile content unchanged');
          delete packageFiles[upgrade.packageFile];
        } else {
          logger.debug('Updating packageFile content');
          packageFiles[upgrade.packageFile] = newContent;
        }
      }
    }
    if (Object.keys(packageFiles).length > 0) {
      logger.info(`${Object.keys(packageFiles).length} package file(s) need updating.`);
      for (const packageFile of Object.keys(packageFiles)) {
        logger.debug(`Adding ${packageFile}`);
        commitFiles.push({
          name: packageFile,
          contents: packageFiles[packageFile]
        });
        try {
          const yarnLockFile = yield yarn.getLockFile(packageFile, packageFiles[packageFile], api, cacheFolder, versions.yarn);
          if (yarnLockFile) {
            // Add new yarn.lock file too
            logger.info(`Adding ${yarnLockFile.name}`);
            commitFiles.push(yarnLockFile);
          }
          const packageLockFile = yield npm.getLockFile(packageFile, packageFiles[packageFile], api, config.versions.npm, versions.npm);
          if (packageLockFile) {
            // Add new package-lock.json file too
            logger.info(`Adding ${packageLockFile.name}`);
            commitFiles.push(packageLockFile);
          }
        } catch (err) {
          logger.info('Could not generate necessary lock file');
          throw err;
        }
      }
    }
    if (commitFiles.length) {
      logger.debug(`${commitFiles.length} file(s) to commit`);
      // API will know whether to create new branch or not
      yield api.commitFilesToBranch(branchName, commitFiles, commitMessage, parentBranch);
    } else {
      logger.debug(`No files to commit`);
    }
    if (!api.branchExists(branchName)) {
      // Return now if no branch exists
      return false;
    }
    if (config.automergeEnabled === false || config.automergeType === 'pr') {
      // No branch automerge
      return true;
    }
    logger.debug('Checking if we can automerge branch');
    const branchStatus = yield api.getBranchStatus(branchName, config.requiredStatusChecks);
    if (branchStatus === 'success') {
      logger.info(`Automerging branch`);
      try {
        yield api.mergeBranch(branchName, config.automergeType);
      } catch (err) {
        logger.error(`Failed to automerge branch`);
        logger.debug(JSON.stringify(err));
        throw err;
      }
    } else {
      logger.debug(`Branch status is "${branchStatus}" - skipping automerge`);
    }
    // Return true as branch exists
    return true;
  });

  return function ensureBranch(_x3) {
    return _ref2.apply(this, arguments);
  };
})();

let processBranchUpgrades = (() => {
  var _ref3 = _asyncToGenerator(function* (branchUpgrades, errors, warnings) {
    logger = branchUpgrades.logger || logger;
    logger.trace({ config: branchUpgrades }, 'processBranchUpgrades');
    const config = Object.assign({}, branchUpgrades);
    // Check schedule
    if (config.schedule && config.schedule.length && schedule.isScheduledNow(config) === false) {
      logger.info('Skipping branch as it is not scheduled');
      return;
    }

    logger = logger.child({
      repository: config.repository,
      branch: config.branchName
    });
    config.logger = logger;

    const packageNames = config.upgrades.map(function (upgrade) {
      return upgrade.depName;
    });
    logger.info(`Branch has ${packageNames.length} upgrade(s): ${packageNames}`);

    try {
      if (
      // Groups and lock file maintenance should set this to true
      config.recreateClosed === false && (yield config.api.checkForClosedPr(config.branchName, config.prTitle))) {
        logger.info(`Skipping branch as matching closed PR already existed`);
        return;
      }
      const branchCreated = yield module.exports.ensureBranch(config);
      if (branchCreated) {
        const pr = yield prWorker.ensurePr(config, logger, errors, warnings);
        if (pr) {
          yield prWorker.checkAutoMerge(pr, config, logger);
        }
      }
    } catch (err) {
      logger.error(`Error updating branch: ${err.message}`);
      logger.debug(JSON.stringify(err));
      // Don't throw here - we don't want to stop the other renovations
    }
  });

  return function processBranchUpgrades(_x4, _x5, _x6) {
    return _ref3.apply(this, arguments);
  };
})();

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const handlebars = require('handlebars');
const packageJsonHelper = require('./package-json');
const npm = require('./npm');
const yarn = require('./yarn');
const schedule = require('./schedule');
const prWorker = require('../pr');
let logger = require('../../logger');

module.exports = {
  getParentBranch,
  ensureBranch,
  processBranchUpgrades
};