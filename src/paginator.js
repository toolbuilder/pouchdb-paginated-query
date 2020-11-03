const flatten = async function * (iterable) {
  for await (const value of iterable) {
    yield * value
  }
}

const map = async function * (fn, iterable) {
  for await (const value of iterable) {
    yield fn(value)
  }
}

/**
 * Paginated query generator function that produces a sequence of query responses
 * until the response contains no entries or an error is thrown.
 *
 * Pagination works by updating the 'startkey' field of the options parameter to
 * query for the next batch of rows when 'options.limit' is less than the number
 * of records specified by the query. It also updates the 'skip' field after the
 * first page to prevent record skipping or duplicates.
 *
 * See https://pouchdb.com/2014/04/14/pagination-strategies-with-pouchdb.html for
 * more information on paginated queries.
 *
 * @param {PouchDB} db - An open PouchDB database. In case you wish to proxy the
 * database for some reason, only db.allDocs will be called by this generator.
 * @param {Object} options - Any valid PouchDB.allDocs(options) query parameter. For
 * pagination to work you should at least set the 'limit' field. The 'startkey, and
 * 'skip' option parameters will be changed as required by this generator to manage
 * pagination.
 * @throws error {PouchError} - any exception thrown by PouchDB
 * @example
 * const db = new PouchDB('db', { ..your options here.. })
 * const paginatedQuery = allDocs(db, { startkey: '03', endkey: '16', limit: 5 })
 * for (const response of paginatedQuery) {
 *  // handle each query response here
 * }
 */
export const allDocs = async function * (db, options) {
  const queryOptions = { ...options }
  let response = await db.allDocs(queryOptions)
  // TODO: not clear how to deal with conflicts
  // not clear how to paginate for options.key
  // startkey is not allowed for options.keys
  if (options.key != null || options.keys != null) return response
  while (response && response.rows.length > 0) {
    // this is how the PouchDb team recommends doing paginated queries
    // pick up the last key returned to use as starting point for next query
    queryOptions.startkey = response.rows[response.rows.length - 1].id
    // skip the next starting point, since it's in this response
    queryOptions.skip = 1

    yield response // so client can access the data
    response = await db.allDocs(queryOptions)
  }
}

/**
 * Paginated PouchDB query that returns each row individually.
 *
 * @param {PouchDB} db - An open PouchDB database. Only 'allDocs' is called in case
 * you wish to proxy the database for some reason such as special error handling.
 * @param {Object} options - Any valid PouchDB.allDocs(options) query parameter. For
 * pagination to work you should at least set the 'limit' field.
 * @throws error {PouchError} - any exception thrown by PouchDB
 * @example
 * const db = new PouchDB('db', { ..your options here.. })
 * const paginatedQuery = rows(db, { startkey: '03', endkey: '16', limit: 5, include_docs: true })
 * for (const row of paginatedQuery) {
 *  console.log(row.doc._id)
 * }
 */
export const rows = (db, options) => flatten(map(response => response.rows, allDocs(db, options)))

/**
 * Iterate over a sequence of queries, using either allDocs or rows as paginagedQueryFn.
 *
 * @param {PouchDB} db - An open PouchDB database. Only 'allDocs' is called in case
 * you wish to proxy the database for some reason such as special error handling.
 * @param {AsyncGeneratorFunction} paginatedQueryFn - An async generator function that takes 'db' as the first parameter,
 * and a query as the second parameter, and returns an iterable that provides the query responses.
 */
export const queries = (db, paginatedQueryFn) => (queries) => flatten(map(query => paginatedQueryFn(db, query), queries))
