let setNpmrc = (() => {
  var _ref = _asyncToGenerator(function* (input) {
    npmrc = input;
  });

  return function setNpmrc(_x) {
    return _ref.apply(this, arguments);
  };
})();

let getDependency = (() => {
  var _ref2 = _asyncToGenerator(function* (name, logger) {
    logger.debug(`getDependency(${name})`);
    const scope = name.split('/')[0];
    const regUrl = registryUrl(scope, { npmrc });
    const pkgUrl = url.resolve(regUrl, encodeURIComponent(name).replace(/^%40/, '@'));
    const authInfo = registryAuthToken(regUrl, { npmrc });
    const headers = {};

    if (authInfo) {
      headers.authorization = `${authInfo.type} ${authInfo.token}`;
    } else if (process.env.NPM_TOKEN) {
      headers.authorization = `Bearer ${process.env.NPM_TOKEN}`;
    }

    // Cache based on combinatino of package URL and headers
    const cacheKey = pkgUrl + JSON.stringify(headers);

    // Return from cache if present
    if (npmCache[cacheKey]) {
      logger.debug(`Returning cached version of ${name}`);
      return npmCache[cacheKey];
    }

    // Retrieve from API if not cached
    try {
      const res = yield got(pkgUrl, {
        json: true,
        headers
      });
      // Determine repository URL
      let repositoryUrl;
      if (res.body.repository) {
        repositoryUrl = parse(res.body.repository.url);
      }
      if (!repositoryUrl) {
        repositoryUrl = res.body.homepage;
      }
      // Simplify response before caching and returning
      const dep = {
        name: res.body.name,
        homepage: res.body.homepage,
        repositoryUrl,
        versions: res.body.versions,
        'dist-tags': res.body['dist-tags']
      };
      Object.keys(dep.versions).forEach(function (version) {
        // We don't use any of the version payload currently
        dep.versions[version] = {};
      });
      npmCache[cacheKey] = dep;
      logger.trace({ dependency: dep }, JSON.stringify(dep));
      return dep;
    } catch (err) {
      logger.warn(`Dependency not found: ${name}`);
      logger.debug(`err: ${JSON.stringify(err)}`);
      return null;
    }
  });

  return function getDependency(_x2, _x3) {
    return _ref2.apply(this, arguments);
  };
})();

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

// Most of this borrowed from https://github.com/sindresorhus/package-json/blob/master/index.js

const got = require('got');
const url = require('url');
const registryUrl = require('registry-url');
const registryAuthToken = require('registry-auth-token');
const parse = require('github-url-from-git');

module.exports = {
  setNpmrc,
  getDependency,
  resetCache
};

let npmCache = {};
let npmrc = null;

function resetCache() {
  npmCache = {};
}