

// Get all repositories that the user has access to
let getRepos = (() => {
  var _ref = _asyncToGenerator(function* (token, endpoint) {
    logger.debug('getRepos(token, endpoint)');
    if (token) {
      process.env.GITLAB_TOKEN = token;
    } else if (!process.env.GITLAB_TOKEN) {
      throw new Error('No token found for getRepos');
    }
    if (endpoint) {
      process.env.GITLAB_ENDPOINT = endpoint;
    }
    try {
      let projects = [];
      const perPage = 100;
      let i = 1;
      let res;
      do {
        const url = `projects?per_page=100&page=${i}`;
        res = yield glGot(url);
        projects = projects.concat(res.body.map(function (repo) {
          return repo.path_with_namespace;
        }));
        i += 1;
      } while (res.body.length === perPage);
      logger.info(`Discovered ${projects.length} project(s)`);
      return projects;
    } catch (err) {
      logger.error(`GitLab getRepos error: ${JSON.stringify(err)}`);
      throw err;
    }
  });

  return function getRepos(_x, _x2) {
    return _ref.apply(this, arguments);
  };
})();

// Initialize GitLab by getting base branch


let initRepo = (() => {
  var _ref2 = _asyncToGenerator(function* (repoName, token, endpoint, repoLogger) {
    if (repoLogger) {
      logger = repoLogger;
    }
    logger.debug(`initRepo(${repoName})`);
    if (token) {
      process.env.GITLAB_TOKEN = token;
    } else if (!process.env.GITLAB_TOKEN) {
      throw new Error(`No token found for GitLab repository ${repoName}`);
    }
    if (token) {
      process.env.GITLAB_TOKEN = token;
    }
    if (endpoint) {
      process.env.GITLAB_ENDPOINT = endpoint;
    }
    try {
      logger.debug(`Determining Gitlab API version`);
      // projects/owned route deprecated in v4
      yield glGot(`projects/owned`);
      config.apiVersion = 'v3';
    } catch (err) {
      config.apiVersion = 'v4';
    }
    logger.debug(`Detected Gitlab API ${config.apiVersion}`);
    config.repoName = repoName.replace('/', '%2F');
    try {
      const res = yield glGot(`projects/${config.repoName}`);
      config.defaultBranch = res.body.default_branch;
      config.baseBranch = config.defaultBranch;
      logger.debug(`${repoName} default branch = ${config.baseBranch}`);
      // Discover our user email
      config.email = (yield glGot(`user`)).body.email;
    } catch (err) {
      logger.error(`GitLab init error: ${JSON.stringify(err)}`);
      throw err;
    }
    return config;
  });

  return function initRepo(_x3, _x4, _x5, _x6) {
    return _ref2.apply(this, arguments);
  };
})();

let setBaseBranch = (() => {
  var _ref3 = _asyncToGenerator(function* (branchName) {
    if (branchName) {
      config.baseBranch = branchName;
    }
  });

  return function setBaseBranch(_x7) {
    return _ref3.apply(this, arguments);
  };
})();

// Search

// Returns an array of file paths in current repo matching the fileName


let findFilePaths = (() => {
  var _ref4 = _asyncToGenerator(function* () {
    logger.debug("Can't find multiple package.json files in GitLab");
    return [];
  });

  return function findFilePaths() {
    return _ref4.apply(this, arguments);
  };
})();

// Branch

// Returns true if branch exists, otherwise false


let branchExists = (() => {
  var _ref5 = _asyncToGenerator(function* (branchName) {
    logger.debug(`Checking if branch exists: ${branchName}`);
    try {
      const url = `projects/${config.repoName}/repository/branches/${branchName}`;
      const res = yield glGot(url);
      if (res.statusCode === 200) {
        logger.debug('Branch exists');
        return true;
      }
      // This probably shouldn't happen
      logger.debug("Branch doesn't exist");
      return false;
    } catch (error) {
      if (error.statusCode === 404) {
        // If file not found, then return false
        logger.debug("Branch doesn't exist");
        return false;
      }
      // Propagate if it's any other error
      throw error;
    }
  });

  return function branchExists(_x8) {
    return _ref5.apply(this, arguments);
  };
})();

// Returns branch object


let getBranch = (() => {
  var _ref6 = _asyncToGenerator(function* (branchName) {
    logger.debug(`getBranch(${branchName})`);
    const url = `projects/${config.repoName}/repository/branches/${branchName}`;
    try {
      return (yield glGot(url)).body;
    } catch (err) {
      logger.warn(`Failed to getBranch ${branchName}`);
      logger.debug(JSON.stringify(err));
      return null;
    }
  });

  return function getBranch(_x9) {
    return _ref6.apply(this, arguments);
  };
})();

// Returns the Pull Request for a branch. Null if not exists.


let getBranchPr = (() => {
  var _ref7 = _asyncToGenerator(function* (branchName) {
    logger.debug(`getBranchPr(${branchName})`);
    const urlString = `projects/${config.repoName}/merge_requests?state=opened`;
    const res = yield glGot(urlString);
    logger.debug(`Got res with ${res.body.length} results`);
    let pr = null;
    res.body.forEach(function (result) {
      if (result.source_branch === branchName) {
        pr = result;
      }
    });
    if (!pr) {
      return null;
    }
    return getPr(config.apiVersion === 'v3' ? pr.id : pr.iid);
  });

  return function getBranchPr(_x10) {
    return _ref7.apply(this, arguments);
  };
})();

// Returns the combined status for a branch.


let getBranchStatus = (() => {
  var _ref8 = _asyncToGenerator(function* (branchName, requiredStatusChecks) {
    logger.debug(`getBranchStatus(${branchName})`);
    if (!requiredStatusChecks) {
      // null means disable status checks, so it always succeeds
      return 'success';
    }
    if (requiredStatusChecks.length) {
      // This is Unsupported
      logger.warn(`Unsupported requiredStatusChecks: ${JSON.stringify(requiredStatusChecks)}`);
      return 'failed';
    }
    // First, get the branch to find the commit SHA
    let url = `projects/${config.repoName}/repository/branches/${branchName}`;
    let res = yield glGot(url);
    const branchSha = res.body.commit.id;
    // Now, check the statuses for that commit
    url = `projects/${config.repoName}/repository/commits/${branchSha}/statuses`;
    res = yield glGot(url);
    logger.debug(`Got res with ${res.body.length} results`);
    if (res.body.length === 0) {
      // Return 'pending' if we have no status checks
      return 'pending';
    }
    let status = 'success';
    // Return 'success' if all are success
    res.body.forEach(function (check) {
      // If one is failed then don't overwrite that
      if (status !== 'failure') {
        if (check.status === 'failed') {
          status = 'failure';
        } else if (check.status !== 'success') {
          status = check.status;
        }
      }
    });
    return status;
  });

  return function getBranchStatus(_x11, _x12) {
    return _ref8.apply(this, arguments);
  };
})();

let deleteBranch = (() => {
  var _ref9 = _asyncToGenerator(function* (branchName) {
    yield glGot.delete(`projects/${config.repoName}/repository/branches/${branchName}`);
  });

  return function deleteBranch(_x13) {
    return _ref9.apply(this, arguments);
  };
})();

// Issue

let addAssignees = (() => {
  var _ref10 = _asyncToGenerator(function* (prNo, assignees) {
    logger.debug(`Adding assignees ${assignees} to #${prNo}`);
    if (assignees.length > 1) {
      logger.error('Cannot assign more than one assignee to Merge Requests');
    }
    let url = `projects/${config.repoName}/merge_requests/${prNo}`;
    url = `${url}?assignee_id=${assignees[0]}`;
    yield glGot.put(url);
  });

  return function addAssignees(_x14, _x15) {
    return _ref10.apply(this, arguments);
  };
})();

let addReviewers = (() => {
  var _ref11 = _asyncToGenerator(function* (prNo, reviewers) {
    logger.debug(`addReviewers('${prNo}, '${reviewers})`);
    logger.error('No reviewer functionality in GitLab');
  });

  return function addReviewers(_x16, _x17) {
    return _ref11.apply(this, arguments);
  };
})();

let addLabels = (() => {
  var _ref12 = _asyncToGenerator(function* (prNo, labels) {
    logger.debug(`Adding labels ${labels} to #${prNo}`);
    let url = `projects/${config.repoName}/merge_requests/${prNo}`;
    url = `${url}?labels=${labels.join(',')}`;
    yield glGot.put(url);
  });

  return function addLabels(_x18, _x19) {
    return _ref12.apply(this, arguments);
  };
})();

let findPr = (() => {
  var _ref13 = _asyncToGenerator(function* (branchName, prTitle, state = 'all') {
    logger.debug(`findPr(${branchName}, ${prTitle}, ${state})`);
    const urlString = `projects/${config.repoName}/merge_requests?state=${state}`;
    const res = yield glGot(urlString);
    let pr = null;
    res.body.forEach(function (result) {
      if ((!prTitle || result.title === prTitle) && result.source_branch === branchName) {
        pr = result;
        // GitHub uses number, GitLab uses iid
        pr.number = pr.id;
        pr.body = pr.description;
        pr.displayNumber = `Merge Request #${pr.iid}`;
        if (pr.state !== 'opened') {
          pr.isClosed = true;
        }
      }
    });
    return pr;
  });

  return function findPr(_x20, _x21) {
    return _ref13.apply(this, arguments);
  };
})();

// Pull Request


let checkForClosedPr = (() => {
  var _ref14 = _asyncToGenerator(function* (branchName, prTitle) {
    const pr = yield findPr(branchName, prTitle, 'closed');
    if (pr) {
      return true;
    }
    return false;
  });

  return function checkForClosedPr(_x22, _x23) {
    return _ref14.apply(this, arguments);
  };
})();

let createPr = (() => {
  var _ref15 = _asyncToGenerator(function* (branchName, title, body, useDefaultBranch) {
    const targetBranch = useDefaultBranch ? config.defaultBranch : config.baseBranch;
    logger.debug(`Creating Merge Request: ${title}`);
    const description = body.replace(/Pull Request/g, 'Merge Request').replace(/PR/g, 'MR');
    const res = yield glGot.post(`projects/${config.repoName}/merge_requests`, {
      body: {
        source_branch: branchName,
        target_branch: targetBranch,
        remove_source_branch: true,
        title,
        description
      }
    });
    const pr = res.body;
    pr.number = pr.id;
    pr.displayNumber = `Merge Request #${pr.iid}`;
    return pr;
  });

  return function createPr(_x24, _x25, _x26, _x27) {
    return _ref15.apply(this, arguments);
  };
})();

let getPr = (() => {
  var _ref16 = _asyncToGenerator(function* (prNo) {
    logger.debug(`getPr(${prNo})`);
    const url = `projects/${config.repoName}/merge_requests/${prNo}`;
    const pr = (yield glGot(url)).body;
    // Harmonize fields with GitHub
    pr.number = config.apiVersion === 'v3' ? pr.id : pr.iid;
    pr.displayNumber = `Merge Request #${pr.iid}`;
    pr.body = pr.description;
    if (pr.state === 'closed' || pr.state === 'merged') {
      logger.debug('pr is closed');
      pr.isClosed = true;
    }
    if (pr.merge_status === 'cannot_be_merged') {
      logger.debug('pr cannot be merged');
      pr.isUnmergeable = true;
    }
    // Check if the most recent branch commit is by us
    // If not then we don't allow it to be rebased, in case someone's changes would be lost
    const branch = yield getBranch(pr.source_branch);
    if (branch && branch.commit.author_email === config.email) {
      pr.canRebase = true;
    }
    return pr;
  });

  return function getPr(_x28) {
    return _ref16.apply(this, arguments);
  };
})();

let updatePr = (() => {
  var _ref17 = _asyncToGenerator(function* (prNo, title, body) {
    const description = body.replace(/Pull Request/g, 'Merge Request').replace(/PR/g, 'MR');
    yield glGot.put(`projects/${config.repoName}/merge_requests/${prNo}`, {
      body: {
        title,
        description
      }
    });
  });

  return function updatePr(_x29, _x30, _x31) {
    return _ref17.apply(this, arguments);
  };
})();

let mergePr = (() => {
  var _ref18 = _asyncToGenerator(function* (pr) {
    yield glGot.put(`projects/${config.repoName}/merge_requests/${pr.number}/merge`, {
      body: {
        should_remove_source_branch: true
      }
    });
  });

  return function mergePr(_x32) {
    return _ref18.apply(this, arguments);
  };
})();

// Generic File operations

let getFile = (() => {
  var _ref19 = _asyncToGenerator(function* (filePath, branchName = config.baseBranch) {
    // Gitlab API v3 support
    let url;
    if (config.apiVersion === 'v3') {
      url = `projects/${config.repoName}/repository/files?file_path=${filePath}&ref=${branchName}`;
    } else {
      url = `projects/${config.repoName}/repository/files/${filePath}?ref=${branchName}`;
    }
    const res = yield glGot(url);
    return res.body.content;
  });

  return function getFile(_x33) {
    return _ref19.apply(this, arguments);
  };
})();

let getFileContent = (() => {
  var _ref20 = _asyncToGenerator(function* (filePath, branchName) {
    try {
      const file = yield getFile(filePath, branchName);
      return new Buffer(file, 'base64').toString();
    } catch (error) {
      if (error.statusCode === 404) {
        // If file not found, then return null JSON
        return null;
      }
      // Propagate if it's any other error
      throw error;
    }
  });

  return function getFileContent(_x34, _x35) {
    return _ref20.apply(this, arguments);
  };
})();

let getFileJson = (() => {
  var _ref21 = _asyncToGenerator(function* (filePath, branchName) {
    const fileContent = yield getFileContent(filePath, branchName);
    return JSON.parse(fileContent);
  });

  return function getFileJson(_x36, _x37) {
    return _ref21.apply(this, arguments);
  };
})();

let createFile = (() => {
  var _ref22 = _asyncToGenerator(function* (branchName, filePath, fileContents, message) {
    // Gitlab API v3 support
    let url;
    const opts = {};
    if (config.apiVersion === 'v3') {
      url = `projects/${config.repoName}/repository/files`;
      opts.body = {
        file_path: filePath,
        branch_name: branchName,
        commit_message: message,
        encoding: 'base64',
        content: new Buffer(fileContents).toString('base64')
      };
    } else {
      url = `projects/${config.repoName}/repository/files/${filePath}`;
      opts.body = {
        branch: branchName,
        commit_message: message,
        encoding: 'base64',
        content: new Buffer(fileContents).toString('base64')
      };
    }
    yield glGot.post(url, opts);
  });

  return function createFile(_x38, _x39, _x40, _x41) {
    return _ref22.apply(this, arguments);
  };
})();

let updateFile = (() => {
  var _ref23 = _asyncToGenerator(function* (branchName, filePath, fileContents, message) {
    // Gitlab API v3 support
    let url;
    const opts = {};
    if (config.apiVersion === 'v3') {
      url = `projects/${config.repoName}/repository/files`;
      opts.body = {
        file_path: filePath,
        branch_name: branchName,
        commit_message: message,
        encoding: 'base64',
        content: new Buffer(fileContents).toString('base64')
      };
    } else {
      url = `projects/${config.repoName}/repository/files/${filePath}`;
      opts.body = {
        branch: branchName,
        commit_message: message,
        encoding: 'base64',
        content: new Buffer(fileContents).toString('base64')
      };
    }
    yield glGot.put(url, opts);
  });

  return function updateFile(_x42, _x43, _x44, _x45) {
    return _ref23.apply(this, arguments);
  };
})();

// Add a new commit, create branch if not existing


let commitFilesToBranch = (() => {
  var _ref24 = _asyncToGenerator(function* (branchName, files, message, parentBranch = config.baseBranch) {
    logger.debug(`commitFilesToBranch('${branchName}', files, message, '${parentBranch})'`);
    if (branchName !== parentBranch) {
      const isBranchExisting = yield branchExists(branchName);
      if (isBranchExisting) {
        logger.debug(`Branch ${branchName} already exists`);
      } else {
        logger.debug(`Creating branch ${branchName}`);
        yield createBranch(branchName);
      }
    }
    for (const file of files) {
      const existingFile = yield getFileContent(file.name, branchName);
      if (existingFile) {
        logger.debug(`${file.name} exists - updating it`);
        yield updateFile(branchName, file.name, file.contents, message);
      } else {
        logger.debug(`Creating file ${file.name}`);
        yield createFile(branchName, file.name, file.contents, message);
      }
    }
  });

  return function commitFilesToBranch(_x46, _x47, _x48) {
    return _ref24.apply(this, arguments);
  };
})();

// GET /projects/:id/repository/commits


let getCommitMessages = (() => {
  var _ref25 = _asyncToGenerator(function* () {
    logger.debug('getCommitMessages');
    try {
      const res = yield glGot(`projects/${config.repoName}/repository/commits`);
      return res.body.map(function (commit) {
        return commit.title;
      });
    } catch (err) {
      logger.error(`getCommitMessages error: ${JSON.stringify(err)}`);
      return [];
    }
  });

  return function getCommitMessages() {
    return _ref25.apply(this, arguments);
  };
})();

// Internal branch operations

// Creates a new branch with provided commit


let createBranch = (() => {
  var _ref26 = _asyncToGenerator(function* (branchName, ref = config.baseBranch) {
    // Gitlab API v3 support
    const opts = {};
    if (config.apiVersion === 'v3') {
      opts.body = {
        branch_name: branchName,
        ref
      };
    } else {
      opts.body = {
        branch: branchName,
        ref
      };
    }
    yield glGot.post(`projects/${config.repoName}/repository/branches`, opts);
  });

  return function createBranch(_x49) {
    return _ref26.apply(this, arguments);
  };
})();

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

let logger = require('../logger');
const glGot = require('gl-got');

const config = {};

module.exports = {
  getRepos,
  initRepo,
  setBaseBranch,
  // Search
  findFilePaths,
  // Branch
  branchExists,
  createBranch,
  getBranch,
  getBranchPr,
  getBranchStatus,
  deleteBranch,
  // issue
  addAssignees,
  addReviewers,
  addLabels,
  // PR
  findPr,
  checkForClosedPr,
  createPr,
  getPr,
  updatePr,
  mergePr,
  // file
  commitFilesToBranch,
  getFile,
  getFileContent,
  getFileJson,
  createFile,
  updateFile,
  // commits
  getCommitMessages
};