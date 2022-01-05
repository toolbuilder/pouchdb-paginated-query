import { test } from 'zora'
import { chainable } from '@toolbuilder/await-for-it'
import { allRows, allDocs, queries } from '../src/paginator.js'
import PouchDB from './database.node.js'

const uniqueIdGenerator = () => {
  let number = 0
  return () => { number++; return number.toString().padStart(2, '0') }
}

const uniqueId = uniqueIdGenerator()

// Create some ids for the test records, and for testing.
const createTestIds = async () => chainable
  .range(20)
  .map(id => id.toString().padStart(2, '0'))
  .toArray()

// Create, and insert test records into the DB.
const insertTestRecords = async (db, testIds) => {
  const records = await chainable(testIds)
    // zero pad id so JS string ordering provides expected results
    .map(id => id.toString().padStart(2, '0'))
    .map(_id => ({ _id, text: `this is ${_id}` }))
    .toArray()
  return db.bulkDocs(records)
}

const newDbWithTestRecords = async (testIds) => {
  const dbId = `db-${uniqueId()}`
  const db = new PouchDB(dbId, { adapter: 'memory' })
  await insertTestRecords(db, testIds)
  return db
}

const paginated = true
test('proper number of records returned for each query', async assert => {
  const testIds = await createTestIds()
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
      },
      paginated
    ],
    [
      'options.paginate == true with limit value causes pagination',
      testIds.slice(3, 17),
      {
        startkey: '03',
        endkey: '16',
        limit: 5,
        include_docs: true,
        descending: false,
        paginate: true // if limit not provided, this makes no sense
      },
      paginated
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
      },
      paginated
    ],
    [
      'paginated query returns no rows',
      [],
      {
        startkey: '458',
        endkey: '459',
        limit: 5,
        include_docs: true,
        descending: false
      },
      paginated
    ],
    [
      'non-paginated query because no limit specified',
      testIds.slice(3, 17),
      {
        startkey: '03',
        endkey: '16',
        include_docs: true,
        descending: false
      },
      !paginated
    ],
    [
      'paginate option stops pagination',
      testIds.slice(3, 8),
      {
        startkey: '03',
        endkey: '16',
        limit: 5,
        include_docs: true,
        descending: false,
        paginate: false
      },
      !paginated
    ]
  ]

  // Run testCases
  await chainable(testCases)
    .forEach(async ([description, expectedIds, query, isPaginated]) => {
      const db = await newDbWithTestRecords(testIds)
      const actualRowCounts = await chainable(allDocs(db, query))
        .map(response => response.rows.length)
        .catch(error => console.log(`Query count Pagination error: ${error}`))
        .finally(async () => db.close())
        .toArray()

      let expectedRowCounts = [expectedIds.length] // for non-paginated queries
      if (isPaginated) {
        // Simulate query (with slice), and pagination (with chunk), to calculate expected row counts
        expectedRowCounts = await chainable(expectedIds).chunk(query.limit, 1).map(chunk => chunk.length).toArray()
        expectedRowCounts.push(0) // to account for last empty query of pagination
      }

      assert.deepEqual(actualRowCounts, expectedRowCounts, description)
    })
})

test('rows', async assert => {
  const testIds = await createTestIds()
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

  // TODO: test with options.key and options.keys

  // Run testCases
  await chainable(testCases)
    .forEach(async ([description, expectedIds, query]) => {
      const db = await newDbWithTestRecords(testIds)

      const actualIds = await chainable(allRows(db, query))
        .map(row => row.id)
        .catch(error => console.log(`Pagination error: ${error}`))
        .finally(async () => db.close())
        .toArray()

      assert.deepEqual(actualIds, expectedIds, description)
    })
})

test('query stream', async assert => {
  const testIds = await createTestIds()
  const db = await newDbWithTestRecords(testIds)

  const queryStream = [ // three queries
    { startkey: '03', endkey: '16', limit: 5, include_docs: true, descending: false },
    { startkey: '03', endkey: '06', limit: 5, include_docs: false, descending: false },
    { startkey: '07', endkey: '16', limit: 5, include_docs: true, descending: false }
  ]

  const actualIds = await chainable(queryStream)
    .mapWith(queries(db, allRows))
    .map(row => row.id)
    .catch(error => console.log(`Pagination error: ${error}`))
    .finally(() => db.close())
    .toArray()

  // Simulate queries to get expected results
  const expectedIds = await chainable(queryStream)
    .map(query => [Number(query.startkey), Number(query.endkey) + 1])
    .map(range => testIds.slice(...range))
    .flatten()
    .toArray()

  assert.deepEqual(actualIds, expectedIds, 'all output from multiple queries as expected')
})
