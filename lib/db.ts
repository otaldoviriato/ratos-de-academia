import { MongoClient } from "mongodb";

if (!process.env.MONGODB_URI) {
  throw new Error("Por favor, adicione a variável MONGODB_URI ao seu arquivo .env ou .env.local");
}

const uri = process.env.MONGODB_URI;
const options = {};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === "development") {
  // Em desenvolvimento, use uma variável global para que o valor seja preservado
  // durante as recargas de módulo devido ao HMR (Hot Module Replacement).
  let globalWithMongo = global as typeof globalThis & {
    _mongoClientPromise?: Promise<MongoClient>;
  };

  if (!globalWithMongo._mongoClientPromise) {
    client = new MongoClient(uri, options);
    globalWithMongo._mongoClientPromise = client.connect();
  }
  clientPromise = globalWithMongo._mongoClientPromise;
} else {
  // Em produção, é melhor não usar uma variável global.
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

export default clientPromise;
