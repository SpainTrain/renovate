

// Get all installations for a GitHub app
let getInstallations = (() => {
  var _ref = _asyncToGenerator(function* (appToken) {
    logger.debug('getInstallations(appToken)');
    try {
      const url = 'app/installations';
      const options = {
        headers: {
          accept: 'application/vnd.github.machine-man-preview+json',
          authorization: `Bearer ${appToken}`
        }
      };
      const res = yield ghGot(url, options);
      logger.debug(`Returning ${res.body.length} results`);
      return res.body;
    } catch (err) {
      logger.error(`GitHub getInstallations error: ${JSON.stringify(err)}`);
      throw err;
    }
  });

  return function getInstallations(_x) {
    return _ref.apply(this, arguments);
  };
})();

// Get the user's installation token


let getInstallationToken = (() => {
  var _ref2 = _asyncToGenerator(function* (appToken, installationId) {
    logger.debug(`getInstallationToken(appToken, ${installationId})`);
    try {
      const url = `installations/${installationId}/access_tokens`;
      const options = {
        headers: {
          accept: 'application/vnd.github.machine-man-preview+json',
          authorization: `Bearer ${appToken}`
        }
      };
      const res = yield ghGot.post(url, options);
      return res.body.token;
    } catch (err) {
      logger.error(`GitHub getInstallationToken error: ${JSON.stringify(err)}`);
      throw err;
    }
  });

  return function getInstallationToken(_x2, _x3) {
    return _ref2.apply(this, arguments);
  };
})();

// Get all repositories for a user's installation


let getInstallationRepositories = (() => {
  var _ref3 = _asyncToGenerator(function* (userToken) {
    logger.debug('getInstallationRepositories(userToken)');
    try {
      const url = 'installation/repositories';
      const options = {
        headers: {
          accept: 'application/vnd.github.machine-man-preview+json',
          authorization: `token ${userToken}`
        }
      };
      const res = yield ghGot(url, options);
      logger.debug(`Returning ${res.body.repositories.length} results from a total of ${res.body.total_count}`);
      return res.body;
    } catch (err) {
      logger.error(`GitHub getInstallationRepositories error: ${JSON.stringify(err)}`);
      throw err;
    }
  });

  return function getInstallationRepositories(_x4) {
    return _ref3.apply(this, arguments);
  };
})();

// Get all repositories that the user has access to


let getRepos = (() => {
  var _ref4 = _asyncToGenerator(function* (token, endpoint) {
    logger.debug('getRepos(token, endpoint)');
    if (token) {
      process.env.GITHUB_TOKEN = token;
    } else if (!process.env.GITHUB_TOKEN) {
      throw new Error('No token found for getRepos');
    }
    if (endpoint) {
      process.env.GITHUB_ENDPOINT = endpoint;
    }
    try {
      const res = yield ghGot('user/repos');
      return res.body.map(function (repo) {
        return repo.full_name;
      });
    } catch (err) /* istanbul ignore next */{
      logger.error(`GitHub getRepos error: ${JSON.stringify(err)}`);
      throw err;
    }
  });

  return function getRepos(_x5, _x6) {
    return _ref4.apply(this, arguments);
  };
})();

// Initialize GitHub by getting base branch and SHA


let initRepo = (() => {
  var _ref5 = _asyncToGenerator(function* (repoName, token, endpoint, repoLogger) {
    logger = repoLogger || logger;
    logger.debug(`initRepo(${JSON.stringify(repoName)})`);
    if (repoLogger) {
      logger = repoLogger;
    }
    if (token) {
      process.env.GITHUB_TOKEN = token;
    } else if (!process.env.GITHUB_TOKEN) {
      throw new Error(`No token found for GitHub repository ${repoName}`);
    }
    if (endpoint) {
      process.env.GITHUB_ENDPOINT = endpoint;
    }
    config.repoName = repoName;
    try {
      const res = yield ghGot(`repos/${repoName}`);
      config.privateRepo = res.body.private === true;
      config.owner = res.body.owner.login;
      logger.debug(`${repoName} owner = ${config.owner}`);
      // Use default branch as PR target unless later overridden
      config.defaultBranch = res.body.default_branch;
      config.baseBranch = config.defaultBranch;
      logger.debug(`${repoName} default branch = ${config.baseBranch}`);
      config.baseCommitSHA = yield getBranchCommit(config.baseBranch);
      if (res.body.allow_rebase_merge) {
        config.mergeMethod = 'rebase';
      } else if (res.body.allow_squash_merge) {
        config.mergeMethod = 'squash';
      } else if (res.body.allow_merge_commit) {
        config.mergeMethod = 'merge';
      } else {
        logger.debug('Could not find allowed merge methods for repo');
      }
    } catch (err) /* istanbul ignore next */{
      logger.error(`GitHub init error: ${JSON.stringify(err)}`);
      throw err;
    }
    return config;
  });

  return function initRepo(_x7, _x8, _x9, _x10) {
    return _ref5.apply(this, arguments);
  };
})();

let setBaseBranch = (() => {
  var _ref6 = _asyncToGenerator(function* (branchName) {
    if (branchName) {
      logger.debug(`Setting baseBranch to ${branchName}`);
      config.baseBranch = branchName;
      config.baseCommitSHA = yield getBranchCommit(config.baseBranch);
    }
  });

  return function setBaseBranch(_x11) {
    return _ref6.apply(this, arguments);
  };
})();

// Search

// Returns an array of file paths in current repo matching the fileName


let findFilePaths = (() => {
  var _ref7 = _asyncToGenerator(function* (fileName) {
    const res = yield ghGot(`search/code?q=repo:${config.repoName}+filename:${fileName}`);
    const exactMatches = res.body.items.filter(function (item) {
      return item.name === fileName;
    });
    // GitHub seems to return files in the root with a leading `/`
    // which then breaks things later on down the line
    return exactMatches.map(function (item) {
      return item.path.replace(/^\//, '');
    });
  });

  return function findFilePaths(_x12) {
    return _ref7.apply(this, arguments);
  };
})();

// Branch

// Returns true if branch exists, otherwise false


let branchExists = (() => {
  var _ref8 = _asyncToGenerator(function* (branchName) {
    logger.debug(`Checking if branch exists: ${branchName}`);
    try {
      const res = yield ghGot(`repos/${config.repoName}/git/refs/heads/${branchName}`);
      if (res.statusCode === 200) {
        if (Array.isArray(res.body)) {
          // This seems to happen if GitHub has partial matches, so we check ref
          const matchedBranch = res.body.some(function (branch) {
            return branch.ref === `refs/heads/${branchName}`;
          });
          if (matchedBranch) {
            logger.debug('Branch exists');
          } else {
            logger.debug('No matching branches');
          }
          return matchedBranch;
        }
        // This should happen if there's an exact match
        return res.body.ref === `refs/heads/${branchName}`;
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

  return function branchExists(_x13) {
    return _ref8.apply(this, arguments);
  };
})();

let getAllRenovateBranches = (() => {
  var _ref9 = _asyncToGenerator(function* () {
    logger.trace('getAllRenovateBranches');
    const allBranches = (yield ghGot(`repos/${config.repoName}/git/refs/heads`)).body;
    return allBranches.reduce(function (arr, branch) {
      if (branch.ref.indexOf('refs/heads/renovate/') === 0) {
        arr.push(branch.ref.substring('refs/heads/'.length));
      }
      return arr;
    }, []);
  });

  return function getAllRenovateBranches() {
    return _ref9.apply(this, arguments);
  };
})();

let isBranchStale = (() => {
  var _ref10 = _asyncToGenerator(function* (branchName) {
    // Check if branch's parent SHA = master SHA
    logger.debug(`isBranchStale(${branchName})`);
    const branchCommit = yield getBranchCommit(branchName);
    logger.debug(`branchCommit=${branchCommit}`);
    const commitDetails = yield getCommitDetails(branchCommit);
    logger.debug(`commitDetails=${JSON.stringify(commitDetails)}`);
    const parentSha = commitDetails.parents[0].sha;
    logger.debug(`parentSha=${parentSha}`);
    // Return true if the SHAs don't match
    return parentSha !== config.baseCommitSHA;
  });

  return function isBranchStale(_x14) {
    return _ref10.apply(this, arguments);
  };
})();

// Returns the Pull Request for a branch. Null if not exists.


let getBranchPr = (() => {
  var _ref11 = _asyncToGenerator(function* (branchName) {
    logger.debug(`getBranchPr(${branchName})`);
    const gotString = `repos/${config.repoName}/pulls?` + `state=open&base=${config.baseBranch}&head=${config.owner}:${branchName}`;
    const res = yield ghGot(gotString);
    if (!res.body.length) {
      return null;
    }
    const prNo = res.body[0].number;
    return getPr(prNo);
  });

  return function getBranchPr(_x15) {
    return _ref11.apply(this, arguments);
  };
})();

// Returns the combined status for a branch.


let getBranchStatus = (() => {
  var _ref12 = _asyncToGenerator(function* (branchName, requiredStatusChecks) {
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
    const gotString = `repos/${config.repoName}/commits/${branchName}/status`;
    logger.debug(gotString);
    const res = yield ghGot(gotString);
    return res.body.state;
  });

  return function getBranchStatus(_x16, _x17) {
    return _ref12.apply(this, arguments);
  };
})();

let deleteBranch = (() => {
  var _ref13 = _asyncToGenerator(function* (branchName) {
    yield ghGot.delete(`repos/${config.repoName}/git/refs/heads/${branchName}`);
  });

  return function deleteBranch(_x18) {
    return _ref13.apply(this, arguments);
  };
})();

let mergeBranch = (() => {
  var _ref14 = _asyncToGenerator(function* (branchName, mergeType) {
    logger.debug(`mergeBranch(${branchName}, ${mergeType})`);
    if (mergeType === 'branch-push') {
      const url = `repos/${config.repoName}/git/refs/heads/${config.baseBranch}`;
      const options = {
        body: {
          sha: yield getBranchCommit(branchName)
        }
      };
      try {
        yield ghGot.patch(url, options);
      } catch (err) {
        logger.error(`Error pushing branch merge for ${branchName}`);
        logger.debug(JSON.stringify(err));
        throw new Error('branch-push failed');
      }
    } else if (mergeType === 'branch-merge-commit') {
      const url = `repos/${config.repoName}/merges`;
      const options = {
        body: {
          base: config.baseBranch,
          head: branchName
        }
      };
      try {
        yield ghGot.post(url, options);
      } catch (err) {
        logger.error(`Error pushing branch merge for ${branchName}`);
        logger.debug(JSON.stringify(err));
        throw new Error('branch-push failed');
      }
    } else {
      throw new Error(`Unsupported branch merge type: ${mergeType}`);
    }
    // Update base commit
    config.baseCommitSHA = yield getBranchCommit(config.baseBranch);
    // Delete branch
    yield deleteBranch(branchName);
  });

  return function mergeBranch(_x19, _x20) {
    return _ref14.apply(this, arguments);
  };
})();

// Issue

let addAssignees = (() => {
  var _ref15 = _asyncToGenerator(function* (issueNo, assignees) {
    logger.debug(`Adding assignees ${assignees} to #${issueNo}`);
    yield ghGot.post(`repos/${config.repoName}/issues/${issueNo}/assignees`, {
      body: {
        assignees
      }
    });
  });

  return function addAssignees(_x21, _x22) {
    return _ref15.apply(this, arguments);
  };
})();

let addReviewers = (() => {
  var _ref16 = _asyncToGenerator(function* (issueNo, reviewers) {
    logger.debug(`Adding reviewers ${reviewers} to #${issueNo}`);
    yield ghGot.post(`repos/${config.repoName}/pulls/${issueNo}/requested_reviewers`, {
      headers: {
        accept: 'application/vnd.github.black-cat-preview+json'
      },
      body: {
        reviewers
      }
    });
  });

  return function addReviewers(_x23, _x24) {
    return _ref16.apply(this, arguments);
  };
})();

let addLabels = (() => {
  var _ref17 = _asyncToGenerator(function* (issueNo, labels) {
    logger.debug(`Adding labels ${labels} to #${issueNo}`);
    logger.debug(labels);
    const labelsArr = Array.from(labels);
    logger.debug(`Adding labelsArr ${labelsArr} to #${issueNo}`);
    logger.debug(labelsArr);
    logger.debug(`labelsArr isArray: ${Array.isArray(labelsArr)}`);
    yield ghGot.post(`repos/${config.repoName}/issues/${issueNo}/labels`, {
      body: labelsArr
    });
  });

  return function addLabels(_x25, _x26) {
    return _ref17.apply(this, arguments);
  };
})();

let findPr = (() => {
  var _ref18 = _asyncToGenerator(function* (branchName, prTitle, state = 'all') {
    logger.debug(`findPr(${branchName}, ${state})`);
    const urlString = `repos/${config.repoName}/pulls?head=${config.owner}:${branchName}&state=${state}`;
    logger.debug(`findPr urlString: ${urlString}`);
    const res = yield ghGot(urlString);
    let pr = null;
    res.body.forEach(function (result) {
      if (!prTitle || result.title === prTitle) {
        pr = result;
        if (pr.state === 'closed') {
          pr.isClosed = true;
        }
        pr.displayNumber = `Pull Request #${pr.number}`;
      }
    });
    return pr;
  });

  return function findPr(_x27, _x28) {
    return _ref18.apply(this, arguments);
  };
})();

// Pull Request


let checkForClosedPr = (() => {
  var _ref19 = _asyncToGenerator(function* (branchName, prTitle) {
    logger.debug(`checkForClosedPr(${branchName}, ${prTitle})`);
    const url = `repos/${config.repoName}/pulls?state=closed&head=${config.owner}:${branchName}`;
    const res = yield ghGot(url);
    // Return true if any of the titles match exactly
    return res.body.some(function (pr) {
      return pr.title === prTitle && pr.head.label === `${config.owner}:${branchName}`;
    });
  });

  return function checkForClosedPr(_x29, _x30) {
    return _ref19.apply(this, arguments);
  };
})();

// Creates PR and returns PR number


let createPr = (() => {
  var _ref20 = _asyncToGenerator(function* (branchName, title, body, useDefaultBranch) {
    const base = useDefaultBranch ? config.defaultBranch : config.baseBranch;
    const pr = (yield ghGot.post(`repos/${config.repoName}/pulls`, {
      body: {
        title,
        head: branchName,
        base,
        body
      }
    })).body;
    pr.displayNumber = `Pull Request #${pr.number}`;
    return pr;
  });

  return function createPr(_x31, _x32, _x33, _x34) {
    return _ref20.apply(this, arguments);
  };
})();

// Gets details for a PR


let getPr = (() => {
  var _ref21 = _asyncToGenerator(function* (prNo) {
    if (!prNo) {
      return null;
    }
    const pr = (yield ghGot(`repos/${config.repoName}/pulls/${prNo}`)).body;
    if (!pr) {
      return null;
    }
    // Harmonise PR values
    pr.displayNumber = `Pull Request #${pr.number}`;
    if (pr.state === 'closed') {
      pr.isClosed = true;
    }
    if (!pr.isClosed) {
      if (pr.mergeable_state === 'dirty') {
        logger.debug(`PR mergeable state is dirty`);
        pr.isUnmergeable = true;
      }
      if (pr.commits === 1) {
        // Only one commit was made - must have been renovate
        logger.debug('Only 1 commit in PR so rebase is possible');
        pr.canRebase = true;
      } else {
        // Check if only one author of all commits
        logger.debug('Checking all commits');
        const prCommits = (yield ghGot(`repos/${config.repoName}/pulls/${prNo}/commits`)).body;
        const authors = prCommits.reduce(function (arr, commit) {
          logger.trace(`Checking commit: ${JSON.stringify(commit)}`);
          let author = 'unknown';
          if (commit.author) {
            author = commit.author.login;
          } else if (commit.commit && commit.commit.author) {
            author = commit.commit.author.email;
          } else {
            logger.debug('Could not determine commit author');
          }
          logger.debug(`Commit author is: ${author}`);
          if (arr.indexOf(author) === -1) {
            arr.push(author);
          }
          return arr;
        }, []);
        logger.debug(`Author list: ${authors}`);
        if (authors.length === 1) {
          pr.canRebase = true;
        }
      }
      if (pr.base.sha !== config.baseCommitSHA) {
        pr.isStale = true;
      }
    }
    return pr;
  });

  return function getPr(_x35) {
    return _ref21.apply(this, arguments);
  };
})();

let getAllPrs = (() => {
  var _ref22 = _asyncToGenerator(function* () {
    const all = (yield ghGot(`repos/${config.repoName}/pulls?state=open`)).body;
    return all.map(function (pr) {
      return {
        number: pr.number,
        branchName: pr.head.ref
      };
    });
  });

  return function getAllPrs() {
    return _ref22.apply(this, arguments);
  };
})();

let updatePr = (() => {
  var _ref23 = _asyncToGenerator(function* (prNo, title, body) {
    yield ghGot.patch(`repos/${config.repoName}/pulls/${prNo}`, {
      body: { title, body }
    });
  });

  return function updatePr(_x36, _x37, _x38) {
    return _ref23.apply(this, arguments);
  };
})();

let mergePr = (() => {
  var _ref24 = _asyncToGenerator(function* (pr) {
    const url = `repos/${config.repoName}/pulls/${pr.number}/merge`;
    const options = {
      body: {}
    };
    if (config.mergeMethod) {
      // This path is taken if we have auto-detected the allowed merge types from the repo
      options.body.merge_method = config.mergeMethod;
      try {
        logger.debug(`mergePr: ${url}, ${JSON.stringify(options)}`);
        yield ghGot.put(url, options);
      } catch (err) {
        logger.error(`Failed to ${options.body.merge_method} PR: ${JSON.stringify(err)}`);
        return;
      }
    } else {
      // We need to guess the merge method and try squash -> rebase -> merge
      options.body.merge_method = 'rebase';
      try {
        logger.debug(`mergePr: ${url}, ${JSON.stringify(options)}`);
        yield ghGot.put(url, options);
      } catch (err1) {
        logger.debug(`Failed to ${options.body.merge_method} PR: ${JSON.stringify(err1)}`);
        try {
          options.body.merge_method = 'squash';
          logger.debug(`mergePr: ${url}, ${JSON.stringify(options)}`);
          yield ghGot.put(url, options);
        } catch (err2) {
          logger.debug(`Failed to ${options.body.merge_method} PR: ${JSON.stringify(err2)}`);
          try {
            options.body.merge_method = 'merge';
            logger.debug(`mergePr: ${url}, ${JSON.stringify(options)}`);
            yield ghGot.put(url, options);
          } catch (err3) {
            logger.debug(`Failed to ${options.body.merge_method} PR: ${JSON.stringify(err3)}`);
            logger.error('All merge attempts failed');
            return;
          }
        }
      }
    }
    // Update base branch SHA
    config.baseCommitSHA = yield getBranchCommit(config.baseBranch);
    // Delete branch
    yield deleteBranch(pr.head.ref);
  });

  return function mergePr(_x39) {
    return _ref24.apply(this, arguments);
  };
})();

// Generic File operations

let getFile = (() => {
  var _ref25 = _asyncToGenerator(function* (filePath, branchName = config.baseBranch) {
    const res = yield ghGot(`repos/${config.repoName}/contents/${filePath}?ref=${branchName}`);
    return res.body.content;
  });

  return function getFile(_x40) {
    return _ref25.apply(this, arguments);
  };
})();

let getFileContent = (() => {
  var _ref26 = _asyncToGenerator(function* (filePath, branchName = config.baseBranch) {
    logger.trace(`getFileContent(filePath=${filePath}, branchName=${branchName})`);
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

  return function getFileContent(_x41) {
    return _ref26.apply(this, arguments);
  };
})();

let getFileJson = (() => {
  var _ref27 = _asyncToGenerator(function* (filePath, branchName) {
    logger.trace(`getFileJson(filePath=${filePath}, branchName=${branchName})`);
    let fileJson = null;
    try {
      fileJson = JSON.parse((yield getFileContent(filePath, branchName)));
    } catch (err) {
      logger.error(`Failed to parse JSON for ${filePath}`);
    }
    return fileJson;
  });

  return function getFileJson(_x42, _x43) {
    return _ref27.apply(this, arguments);
  };
})();

// Add a new commit, create branch if not existing


let commitFilesToBranch = (() => {
  var _ref28 = _asyncToGenerator(function* (branchName, files, message, parentBranch = config.baseBranch) {
    logger.debug(`commitFilesToBranch('${branchName}', files, message, '${parentBranch})'`);
    const parentCommit = yield getBranchCommit(parentBranch);
    const parentTree = yield getCommitTree(parentCommit);
    const fileBlobs = [];
    // Create blobs
    for (const file of files) {
      const blob = yield createBlob(file.contents);
      fileBlobs.push({
        name: file.name,
        blob
      });
    }
    // Create tree
    const tree = yield createTree(parentTree, fileBlobs);
    const commit = yield createCommit(parentCommit, tree, message);
    const isBranchExisting = yield branchExists(branchName);
    if (isBranchExisting) {
      yield updateBranch(branchName, commit);
    } else {
      yield createBranch(branchName, commit);
    }
  });

  return function commitFilesToBranch(_x44, _x45, _x46) {
    return _ref28.apply(this, arguments);
  };
})();

// Internal branch operations

// Creates a new branch with provided commit


let createBranch = (() => {
  var _ref29 = _asyncToGenerator(function* (branchName, commit = config.baseCommitSHA) {
    yield ghGot.post(`repos/${config.repoName}/git/refs`, {
      body: {
        ref: `refs/heads/${branchName}`,
        sha: commit
      }
    });
  });

  return function createBranch(_x47) {
    return _ref29.apply(this, arguments);
  };
})();

// Internal: Updates an existing branch to new commit sha


let updateBranch = (() => {
  var _ref30 = _asyncToGenerator(function* (branchName, commit) {
    logger.debug(`Updating branch ${branchName} with commit ${commit}`);
    yield ghGot.patch(`repos/${config.repoName}/git/refs/heads/${branchName}`, {
      body: {
        sha: commit,
        force: true
      }
    });
  });

  return function updateBranch(_x48, _x49) {
    return _ref30.apply(this, arguments);
  };
})();

// Low-level commit operations

// Create a blob with fileContents and return sha


let createBlob = (() => {
  var _ref31 = _asyncToGenerator(function* (fileContents) {
    logger.debug('Creating blob');
    return (yield ghGot.post(`repos/${config.repoName}/git/blobs`, {
      body: {
        encoding: 'base64',
        content: new Buffer(fileContents).toString('base64')
      }
    })).body.sha;
  });

  return function createBlob(_x50) {
    return _ref31.apply(this, arguments);
  };
})();

// Return the commit SHA for a branch


let getBranchCommit = (() => {
  var _ref32 = _asyncToGenerator(function* (branchName) {
    return (yield ghGot(`repos/${config.repoName}/git/refs/heads/${branchName}`)).body.object.sha;
  });

  return function getBranchCommit(_x51) {
    return _ref32.apply(this, arguments);
  };
})();

let getCommitDetails = (() => {
  var _ref33 = _asyncToGenerator(function* (commit) {
    logger.debug(`getCommitDetails(${commit})`);
    const results = yield ghGot(`repos/${config.repoName}/git/commits/${commit}`);
    return results.body;
  });

  return function getCommitDetails(_x52) {
    return _ref33.apply(this, arguments);
  };
})();

// Return the tree SHA for a commit


let getCommitTree = (() => {
  var _ref34 = _asyncToGenerator(function* (commit) {
    logger.debug(`getCommitTree(${commit})`);
    return (yield ghGot(`repos/${config.repoName}/git/commits/${commit}`)).body.tree.sha;
  });

  return function getCommitTree(_x53) {
    return _ref34.apply(this, arguments);
  };
})();

// Create a tree and return SHA


let createTree = (() => {
  var _ref35 = _asyncToGenerator(function* (baseTree, files) {
    logger.debug(`createTree(${baseTree}, files)`);
    const body = {
      base_tree: baseTree,
      tree: []
    };
    files.forEach(function (file) {
      body.tree.push({
        path: file.name,
        mode: '100644',
        type: 'blob',
        sha: file.blob
      });
    });
    logger.debug(body);
    return (yield ghGot.post(`repos/${config.repoName}/git/trees`, { body })).body.sha;
  });

  return function createTree(_x54, _x55) {
    return _ref35.apply(this, arguments);
  };
})();

// Create a commit and return commit SHA


let createCommit = (() => {
  var _ref36 = _asyncToGenerator(function* (parent, tree, message) {
    logger.debug(`createCommit(${parent}, ${tree}, ${message})`);
    return (yield ghGot.post(`repos/${config.repoName}/git/commits`, {
      body: {
        message,
        parents: [parent],
        tree
      }
    })).body.sha;
  });

  return function createCommit(_x56, _x57, _x58) {
    return _ref36.apply(this, arguments);
  };
})();

let getCommitMessages = (() => {
  var _ref37 = _asyncToGenerator(function* () {
    logger.debug('getCommitMessages');
    try {
      const res = yield ghGot(`repos/${config.repoName}/commits`);
      return res.body.map(function (commit) {
        return commit.commit.message;
      });
    } catch (err) {
      logger.error(`getCommitMessages error: ${JSON.stringify(err)}`);
      return [];
    }
  });

  return function getCommitMessages() {
    return _ref37.apply(this, arguments);
  };
})();

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

let logger = require('../logger');
const ghGot = require('gh-got');

const config = {};

module.exports = {
  // GitHub App
  getInstallations,
  getInstallationToken,
  getInstallationRepositories,
  // Initialization
  getRepos,
  initRepo,
  setBaseBranch,
  // Search
  findFilePaths,
  // Branch
  branchExists,
  getAllRenovateBranches,
  isBranchStale,
  getBranchPr,
  getBranchStatus,
  deleteBranch,
  mergeBranch,
  // issue
  addAssignees,
  addReviewers,
  addLabels,
  // PR
  findPr,
  checkForClosedPr,
  createPr,
  getPr,
  getAllPrs,
  updatePr,
  mergePr,
  // file
  commitFilesToBranch,
  getFile,
  getFileContent,
  getFileJson,
  // Commits
  getCommitMessages
};