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
const paginatedQuery = async function * (db, options) {
  const queryOptions = { ...options }
  let response = await db.allDocs(queryOptions)
  // No need to paginate for options.key,
  // and startkey is not allowed for options.keys
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
  yield response // the final response, which contains no rows
}

const nonPaginatedQuery = async function * (db, options) {
  yield db.allDocs(options)
}

/**
 * PouchDB query response provided as an async iterator. If pagination is selected
 * as an option, responses are provided until the response contains no entries or
 * an error is thrown. Only responses containing rows are returned.
 *
 * By default, pagination is on if the limit field has a value. To turn it off,
 * set options.paginate = false.
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
 * pagination. The query will NOT be paginated if options.limit == null || options.paginate === false
 * @throws error {PouchError} - any exception thrown by PouchDB
 * @example
 * const db = new PouchDB('db', { ..your options here.. })
 * const paginatedQuery = allDocs(db, { startkey: '03', endkey: '16', limit: 5 })
 * for await (const response of paginatedQuery) {
 *  // handle each query response here
 * }
 */
export const allDocs = (db, options) => {
  const nonPaginated = options.limit == null || options.paginate === false
  return nonPaginated ? nonPaginatedQuery(db, options) : paginatedQuery(db, options)
}

/**
 * The rows from paginated queries provided as an async iterator. If pagination is selected
 * as an option, rows are provided until the PouchDB response contains no entries or
 * an error is thrown.
 *
 * This function is a convenience wrapper around allDocs that returns just the rows.
 *
 * @param {PouchDB} db - An open PouchDB database. Only 'db.allDocs' is called in case
 * you wish to proxy the database for some reason such as special error handling.
 * @param {Object} options - Any valid PouchDB.allDocs(options) query parameter. The query
 * will NOT be paginated if options.limit == null || options.paginate === false
 * @throws error {PouchError} - any exception thrown by PouchDB
 * @example
 * const db = new PouchDB('db', { ..your options here.. })
 * const paginatedQuery = rows(db, { startkey: '03', endkey: '16', limit: 5, include_docs: true })
 * for await (const row of paginatedQuery) {
 *  console.log(row.doc._id)
 * }
 */
export const allRows = (db, options) => flatten(map(response => response.rows, allDocs(db, options)))

/**
 * Iterate over a sequence of queries, using either allDocs or rows as paginatedQueryFn.
 *
 * @param {PouchDB} db - An open PouchDB database. Only 'db.allDocs' is called in case
 * you wish to proxy the database for some reason such as special error handling.
 * @param {AsyncGeneratorFunction} paginatedQueryFn - any function that matches the signature of allDocs or allRows.
 */
export const queries = (db, paginatedQueryFn) => (queries) => flatten(map(query => paginatedQueryFn(db, query), queries))
