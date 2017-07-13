let pruneStaleBranches = (() => {
  var _ref = _asyncToGenerator(function* (config, branchList) {
    const logger = config.logger;
    logger.debug('Removing any stale branches');
    logger.trace({ config }, `pruneStaleBranches:\n${JSON.stringify(branchList)}`);
    if (config.platform !== 'github') {
      logger.debug('Platform is not GitHub - returning');
      return;
    }
    const renovateBranches = yield config.api.getAllRenovateBranches();
    logger.debug(`renovateBranches=${renovateBranches}`);
    const remainingBranches = renovateBranches.filter(function (branch) {
      return branchList.indexOf(branch) === -1;
    });
    logger.debug(`remainingBranches=${remainingBranches}`);
    if (remainingBranches.length === 0) {
      logger.debug('No branches to clean up');
      return;
    }
    for (const branchName of remainingBranches) {
      logger.debug({ branch: branchName }, `Deleting orphan branch`);
      yield config.api.deleteBranch(branchName);
    }
  });

  return function pruneStaleBranches(_x, _x2) {
    return _ref.apply(this, arguments);
  };
})();

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

module.exports = {
  pruneStaleBranches
};