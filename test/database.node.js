import PouchDB from 'pouchdb'
import InMemoryAdapter from 'pouchdb-adapter-memory'

export const Database = PouchDB.plugin(InMemoryAdapter)
