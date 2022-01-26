import { baseBrowserTestConfig, nodeConfigs } from '@toolbuilder/rollup-plugin-test-tools'

const options = {
  packageName: 'pouchdb-paginated-query-browser',
  input: ['test/**/*test.js'], // unit test source file glob
  aliasOptions: { // 1: select different file to import than Node pack file test uses
    entries: [
      { find: './database.node.js', replacement: './database.browser.js' }
    ]
  }, // file aliases for browser build
  external: ['pouchdb'], // 3a: Make PouchDB external
  globals: {
    pouchdb: 'PouchDB' // 3b: and specify global name exported by PouchDB UMD package
  },
  checkSemverConflicts: true, // check for semver range conflicts between testPackageJson and packageJson
  testPackageJson: {
    type: 'module', // whether module or commonjs doesn't seem to matter for the test.
    scripts: { // 2: test script changed to concatenate the PouchDB distribution files for browser with the test UMD file
      test: 'cat ./node_modules/pouchdb/dist/pouchdb.min.js ./node_modules/pouchdb/dist/pouchdb.memory.min.js all.umd.js | tape-run'
    },
    // Auto-magically adds external dependencies calculated
    // by relativeToPackage, so no need to list them.
    devDependencies: {
    // dependencies for test script
      'cash-cat': '^0.2.0', // provides 'cat' for non-POSIX shells
      'tape-run': '^9.0.0'
    }
  }
}

export default [...nodeConfigs, ...baseBrowserTestConfig(options)]
// export default [...browserTestConfig]
