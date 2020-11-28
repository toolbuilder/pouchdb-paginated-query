# Pouchdb-Paginated-Query

`Pouchdb-Paginated-Query` performs paginated PouchDB queries, and provides each result via an async iterable. It works well with [await-for-it](https://github.com/toolbuilder/await-for-it), which joins async iterables with event handling, transformations, and pub/sub.

Here is a very simple example.

```javascript
import { allRows } from '@toolbuilder/pouchdb-paginated-query'

const db = new PouchDB('db', { ..your options here.. })
// allRows interprets 'limit' as the page size
const paginatedQuery = allRows(db, { startkey: '03', endkey: '16', limit: 5 })
for await (const row of paginatedQuery) {
  // handle each returned row here
}
```

Here is the simplest example with [await-for-it](https://github.com/toolbuilder/await-for-it).

```javascript
import { allRows } from '@toolbuilder/pouchdb-paginated-query'
import { chainable } from '@toolbuilder/await-for-it'

const db = new PouchDB('db', { ..your options here.. })
// allDocs interprets 'limit' as the page size
const paginatedQuery = allRows(db, { startkey: '03', endkey: '16', limit: 5, include_docs: true })
chainable(paginatedQuery)
  .map(row => row.doc)
  .callAwait(async doc => /* your processing function here */)
  .catch(error => { /* your exception handler here */ })
  .finally(() => { /* your cleanup function here */ })
  .run() // start asynchronous processing

```

## Installation

```bash
npm install --save @toolbuilder/pouchdb-paginated-query
```

## API

* [allDocs](#allDocs)
* [allRows](#allRows)
* [queries](#queries)

### **allDocs**

Paginated PouchDB query responses provided as an async iterator. If pagination is selected as an option, responses are provided until the response contains no entries or an error is thrown.

By default, pagination is performed if the `limit` field has a value. To turn it off, set options.paginate = false.

Pagination works by updating the 'startkey' field of the options parameter to query for the next batch of rows when 'options.limit' is less than the number
of records specified by the query. It also updates the 'skip' field after the first page to prevent record skipping or duplicates. See <https://pouchdb.com/2014/04/14/pagination-strategies-with-pouchdb.html> for more information on paginated queries.

* `db` **PouchDB** An open PouchDB database. In case you wish to proxy the database for some reason, only `db.allDocs` will be called by this generator.
* `options` **Object** Any valid `PouchDB.allDocs(options)` query parameter. For pagination to work you should at least set the 'limit' field. The startkey, and 'skip' option parameters will be changed as required by this generator to manage pagination. The query will NOT be paginated if `options.limit == null || options.paginate === false`

Throws **PouchError** if any exception is thrown by PouchDB.

Returns **AsyncIterable** where each value is an unmodified PouchDB.allDocs() return value.

```javascript
import PouchDB from 'pouchdb'
import { allDocs } from '@toolbuilder/pouchdb-paginated-query'

const db = new PouchDB('db', { ..your options here.. })
const paginatedQuery = allDocs(db, { startkey: '03', endkey: '16', limit: 5 })
for await (const response of paginatedQuery) {
  const rows = response.total_rows
  for (const row of response.rows) {
    // handle rows here
  }
}
```

### **allRows**

The rows from paginated queries provided as an async iterator. If pagination is selected as an option, rows are provided until the PouchDB response contains no entries or an error is thrown.

This function is a convenience wrapper around [allDocs](#allDocs) that returns just the rows.

* `db` **PouchDB** An open PouchDB database. In case you wish to proxy the database for some reason, only `db.allDocs` will be called by this generator.
* `options` **Object** Any valid `PouchDB.allDocs(options)` query parameter. For pagination to work you should at least set the 'limit' field. The startkey, and 'skip' option parameters will be changed as required by this generator to manage pagination. The query will NOT be paginated if `options.limit == null || options.paginate === false`.

Throws **PouchError** if any exception is thrown by PouchDB.

Returns **AsyncIterable** where each value is a row object from a PouchDB query.

```javascript
import PouchDB from 'pouchdb'
import { allDocs } from '@toolbuilder/pouchdb-paginated-query'

const db = new PouchDB('db', { ..your options here.. })
const paginatedQuery = allRows(db, { startkey: '03', endkey: '16', limit: 5 })
for await (const response of paginatedQuery) {
  const id = response.id
  const doc = response.doc
  // row processing here
}
```

### **queries**

Iterate over a sequence of queries, using allDocs, allRows, or your own custom function as paginatedQueryFn.

* `db` **PouchDB** An open PouchDB database. In case you wish to proxy the database for some reason, only `db.allDocs` will be called by this generator.
* `paginatedQueryFn` **AsyncGeneratorFunction** any function that matches the signature of allDocs or allRows. The function will be called once for each query provided.

Throws **PouchError** if any exception is thrown by PouchDB.

Returns **AsyncIterable** where each value is yielded from a `paginatedQueryFn` iterable.

```javascript
import PouchDB from 'pouchdb'
import { queries, allRows } from '@toolbuilder/paginated-pouchdb-query'

const db = new PouchDB('db', { ..your options here.. })
const someQueries = [{ /* query options */ }, { /* query options */ }]
// Call allRows for each query and process the results
for await (const row of queries(db, allRows)(someQueries)) {
  // process rows from both queries here
}
```

This example uses [await-for-it](https://github.com/toolbuilder/await-for-it) to query PouchDB in response to events.

```javascript
import { chainable, Queue } from '@toolbuilder/await-for-it'
import { RingBuffer } from '@toolbuilder/ring-buffer'
import PouchDB from 'pouchdb'
import { queries, allRows } from '@toolbuilder/paginated-pouchdb-query'

// Setup queue to keep only the most recent 100 data values.
// Older values that have not been processed yet are quietly dropped.
// This behavior is provided by RingBuffer. Other buffers behave differently.
// For example, an Array will never drop anything, but could grow forever.
const queue = new Queue(new RingBuffer(100))

// setup an async iterator to handle the input events
const controller = chainable(queue)
  .filter(event => dropEventsThatYouDoNotWant(event))
  .map(async (event) => generateQueryOptionsFromEvent(event))
  // Perform query, and return rows for each event
  .mapWith(queries(db, allRows))
  .map(async (row) => processRow(row))
  // An error stops all iteration
  .catch(error => handleErrors(error))
  .finally(async () => doSomeCleanup())
  .run() // you could use 'publish' here if you want pub/sub

// In your event handler, push events into the queue
const eventHandler = (event) => queue.push(event)
// register your event handler of course

// You can stop/resume the chainable iterator if you need to.
// You can still push to the queue while chainable is stopped,
// but the buffer might drop what you push depending on the buffer
// you choose.
if (controller.running) controller.stop()
controller.start()

// Somewhere else, such as an 'application done' event, tell the
// Queue that it is done so that the chainable finally method is called
// By default all values in the buffer are processed before iteration stops.
queue.done()

// Elsewhere, you can also pass an exception to the queue, so that the async
// iterator will handle it asynchronously.
queue.exception(new YourError(someData))
// The .catch() method in the chainable above will now get
// YourError, and iteration will stop

```
