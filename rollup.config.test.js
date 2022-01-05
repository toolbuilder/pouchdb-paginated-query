import alias from '@rollup/plugin-alias'
import { testConfigs, createPackFile, createTestPackageJson, multiInput, relativeToPackage, runCommands, shellCommand, tempPath } from '@toolbuilder/rollup-plugin-test-tools'
import { join } from 'path'
import multiEntry from '@rollup/plugin-multi-entry'
import resolve from '@rollup/plugin-node-resolve'

const browserTempPath = tempPath('pouchdb-paginated-query-browser')

/*
  This configuration was copied from @toolbuilder/rollup-plugin-test-tools.
  That configuration does not rollup PouchDB or the adapter correctly.
  Eventually settled on using the UMD browser files distributed in the PouchDB package.
  However, the in-memory adapter plugin is called differently than in Node. So a number
  of changes were required.

  1: Use @rollup/plugin-alias to select a different file (database.browser.js) than the Node unit test uses.
  2: Change test script in generated package.json file to incorporate the PouchDB distribution files
  3: Tell rollup that PouchDB is external and provide the UMD name exported by PouchDB
  4: Add @rollup/plugin-commonjs package to
*/
const browser = [
  {
    input: ['test/**/*test.js'],
    output: {
      format: 'es', // NOTE: if you build as 'umd', then you will need the commonjs plugin in the last step
      name: 'something',
      dir: join(browserTempPath, 'test')
    },
    plugins: [
      alias({ // 1: select different file to import than Node unit test uses
        entries: [
          { find: './database.node.js', replacement: './database.browser.js' }
        ]
      }),
      multiInput({ relative: 'test/' }),
      relativeToPackage({
        modulePaths: 'src/**/*.js'
      }),
      // relativeToPackage has identified the external packages,
      // which createTestPackageJson needs. The external packages
      // are not available in the following configs, so run now.
      createTestPackageJson({
        outputDir: browserTempPath,
        testPackageJson: {
          type: 'module', // whether module or commonjs doesn't seem to matter for the test.
          scripts: { // 2: test script changed to concatenate the PouchDB distribution files for browser with the test UMD file
            test: 'cat ./node_modules/pouchdb/dist/pouchdb.min.js ./node_modules/pouchdb/dist/pouchdb.memory.min.js all.umd.js | tape-run | tap-nirvana'
          },
          // Auto-magically adds external dependencies calculated
          // by relativeToPackage, so no need to list them.
          devDependencies: {
          // dependencies for test script
            'cash-cat': '^0.2.0', // provides 'cat' for non-POSIX shells
            'tape-run': '^9.0.0',
            'tap-nirvana': '^1.1.0'
          }
        }
      }),
      // Might as well create the packfile now, since we just built the
      // package.json and figured out the dependencies.
      createPackFile({
        outputDir: browserTempPath,
        packCommand: 'pnpm pack'
      }),
      // Install the external dependencies.
      runCommands({
        commands: [
        // Need to run this now, so the Rollup config that builds
        // the UMD file has them available to pull into the output.
          shellCommand(`pnpm -C ${browserTempPath} install`)
        ]
      })
    ]
  },
  // multiInput will not create a single output file, so use multiEntry for that.
  // Each test has a separate entry point, but multiEntry will combine them into
  // one test. Since the tests run automatically, they will run when all.js is
  // loaded.
  {
    input: [join(browserTempPath, 'test/**/*test.js')],
    // The external packages are unknown at this point, so will have to
    // put up with warnings, or figure them out dynamically
    output: {
      format: 'es',
      file: join(browserTempPath, 'test', 'all.js')
    },
    plugins: [
      multiEntry()
    ]
  },
  // multiEntry will not create UMD output, so another rollup config for that.
  // Create UMD file that runs all the unit tests, still with unmet external dependencies
  {
    input: join(browserTempPath, 'test', 'all.js'),
    external: ['pouchdb'], // 3a: Make PouchDB external
    output: {
      globals: {
        pouchdb: 'PouchDB' // 3b: and specify global name exported by PouchDB UMD package
      },
      file: join(browserTempPath, 'all.umd.js'),
      format: 'umd',
      name: 'alltests'
    },
    plugins: [
      resolve(), // find CommonJS/ES modules in node_modules
      runCommands({
        commands: [
          shellCommand(`pnpm -C ${browserTempPath} test`)
        ]
      })
    ]
  }

]

// This is a hack: we know testConfigs[0] is complete CommonJS packfile test, and testConfigs[1] is for ES packfile test.
export default [testConfigs[0], testConfigs[1], ...browser]
