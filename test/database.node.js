import PouchDB from 'pouchdb'
import InMemoryAdapter from 'pouchdb-adapter-memory'

export default PouchDB.plugin(InMemoryAdapter)
