let getChangeLogJSON = (() => {
  var _ref = _asyncToGenerator(function* (depName, fromVersion, newVersion, logger) {
    logger.debug(`getChangeLogJSON(${depName}, ${fromVersion}, ${newVersion})`);
    if (!fromVersion || fromVersion === newVersion) {
      return null;
    }
    const semverString = `>${fromVersion} <=${newVersion}`;
    logger.debug(`semverString: ${semverString}`);
    try {
      return yield changelog.generate(depName, semverString);
    } catch (err) {
      logger.warn(`getChangeLogJSON error: ${JSON.stringify(err)}`);
      return null;
    }
  });

  return function getChangeLogJSON(_x, _x2, _x3, _x4) {
    return _ref.apply(this, arguments);
  };
})();

// Get Changelog
let getChangeLog = (() => {
  var _ref2 = _asyncToGenerator(function* (depName, fromVersion, newVersion, logger) {
    const logJSON = yield getChangeLogJSON(depName, fromVersion, newVersion, logger);
    return getMarkdown(logJSON);
  });

  return function getChangeLog(_x5, _x6, _x7, _x8) {
    return _ref2.apply(this, arguments);
  };
})();

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const changelog = require('changelog');

module.exports = {
  getChangeLogJSON,
  getMarkdown,
  getChangeLog
};

function getMarkdown(changelogJSON) {
  if (!changelogJSON) {
    return 'No changelog available';
  }
  let markdownLog = changelog.markdown(changelogJSON);
  markdownLog = `### Changelog\n\n${markdownLog}`;
  // Fix up the markdown formatting of changelog
  // This is needed for GitLab in particular
  markdownLog = markdownLog.replace(/(.*?)\n[=]{10,}/g, '#### $1');
  return markdownLog;
}