import { test } from 'zora'
import { chainable as iterablefu } from 'iterablefu'
import { chainable } from '@toolbuilder/await-for-it'
import { rows, allDocs, queries } from '../src/paginator'
import PouchDB from 'pouchdb'
import InMemoryAdapter from 'pouchdb-adapter-memory'
import cuid from 'cuid' // each db instance requires a unique id

PouchDB.plugin(InMemoryAdapter)

// Create some ids for the test records, and for testing.
const testIds = iterablefu
  .range(20)
  .map(id => id.toString().padStart(2, '0'))
  .toArray()

// Create, and insert test records into the DB.
const insertTestRecords = async (db, testIds) => {
  const records = iterablefu(testIds)
    // zero pad id so JS string ordering provides expected results
    .map(id => id.toString().padStart(2, '0'))
    .map(_id => ({ _id, text: `this is ${_id}` }))
    .toArray()
  return db.bulkDocs(records)
}

const newDbWithTestRecords = async (testIds) => {
  const db = new PouchDB(`db-${cuid()}`, { adapter: 'memory' })
  await insertTestRecords(db, testIds)
  return db
}

test('proper number of records returned for each query', async assert => {
  const testCases = [
    [
      'ascending paginated query made expected number of queries',
      testIds.slice(3, 17),
      {
        startkey: '03',
        endkey: '16',
        limit: 5,
        include_docs: true,
        descending: false
      }
    ],
    [
      'descending paginated query made expected number of queries',
      testIds.slice(3, 17).reverse(),
      {
        startkey: '16',
        endkey: '03',
        limit: 5,
        include_docs: true,
        descending: true
      }
    ]
  ]

  // Run testCases
  await chainable(testCases)
    .forEach(async ([description, expectedIds, query]) => {
      const db = await newDbWithTestRecords(testIds)
      const actualRowCounts = await chainable(allDocs(db, query))
        .map(response => response.rows.length)
        .catch(error => console.log(`Query count Pagination error: ${error}`))
        .finally(async () => db.close())
        .toArray()

      // Simulate query (with slice), and pagination (with chunk), to calculate expected row counts
      const expectedRowCounts = iterablefu(expectedIds).chunk(query.limit).map(chunk => chunk.length).toArray()

      assert.deepEqual(actualRowCounts, expectedRowCounts, description)
    })
})

test('rows', async assert => {
  const testCases = [
    [
      'all expected ids returned',
      testIds.slice(3, 17),
      {
        startkey: '03',
        endkey: '16',
        limit: 5,
        include_docs: false,
        descending: false
      }
    ],
    [
      'query response with no rows handled',
      [],
      {
        startkey: '20',
        endkey: '36',
        limit: 5,
        include_docs: false,
        descending: false
      }
    ],
    [
      'non-paginated query handled',
      testIds.slice(3, 17),
      {
        startkey: '03',
        endkey: '16',
        // limit: 5 // removing this field eliminates pagination
        include_docs: false,
        descending: false
      }
    ],
    [
      'missing startkey handled',
      testIds,
      {
        limit: 5,
        include_docs: true,
        descending: false
      }
    ],
    [
      'initial skip supported',
      testIds.slice(3),
      {
        limit: 2,
        skip: 3,
        include_docs: true,
        descending: false
      }
    ],
    [
      'include_docs === false supported',
      testIds.slice(3),
      {
        limit: 2,
        skip: 3,
        include_docs: false,
        descending: false
      }
    ],
    [
      'limit zero returns nothing',
      [],
      {
        limit: 0
      }
    ],
    [
      'descending true works correctly',
      testIds.slice(3, 17).reverse(),
      {
        startkey: '16',
        endkey: '03',
        limit: 5,
        include_docs: false,
        descending: true
      }
    ]
  ]

  // TODO: can multiple records have the same key??? CouchDB says yes, options.key seems to say yes.
  // TODO: test with options.key and options.keys

  // Run testCases
  await chainable(testCases)
    .forEach(async ([description, expectedIds, query]) => {
      const db = await newDbWithTestRecords(testIds)

      const actualIds = await chainable(rows(db, query))
        .map(row => row.id)
        .catch(error => console.log(`Pagination error: ${error}`))
        .finally(async () => db.close())
        .toArray()

      assert.deepEqual(actualIds, expectedIds, description)
    })
})

test('query stream', async assert => {
  const db = await newDbWithTestRecords(testIds)

  const queryStream = [ // three queries
    { startkey: '03', endkey: '16', limit: 5, include_docs: true, descending: false },
    { startkey: '03', endkey: '06', limit: 5, include_docs: false, descending: false },
    { startkey: '07', endkey: '16', limit: 5, include_docs: true, descending: false }
  ]

  const actualIds = await chainable(queryStream)
    .mapWith(queries(db, rows))
    .map(row => row.id)
    .catch(error => console.log(`Pagination error: ${error}`))
    .finally(() => db.close())
    .toArray()

  // Simulate queries to get expected results
  const expectedIds = iterablefu(queryStream)
    .map(query => [Number(query.startkey), Number(query.endkey) + 1])
    .map(range => testIds.slice(...range))
    .flatten()
    .toArray()

  assert.deepEqual(actualIds, expectedIds, 'all output from multiple queries as expected')
})
