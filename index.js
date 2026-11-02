import express from "express"
import cors from "cors";
import 'dotenv/config'
import { MongoClient } from 'mongodb';


const app = express();
const port = process.env.port || 5000;

app.use(express.json());

//to connect frontend with server
app.use(
  cors({
    origin: [
      `${process.env.FRONTEND_URL_LOCAL}`,
      `${process.env.FRONTEND_URL_VERCEL}`,
    ],
  }),
);



//connect to Mongodb
const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}
const connectedClient=await connectToMongoDB();

// connect/create database user(db) and collection
const database = connectedClient.db("booknook-db1"); 
const books = database.collection("books");       



//server homepage : http://localhost:5000/
app.get('/', (req, res) => {
    res.send('Welcome to BookNook Server')
})


// CRUD Operations

//http://localhost:5000/add-book
app.post("/add-book", async (req, res) => {
	  const newBook = req.body;
	  // console.log("data from client:", newBook);
	  // const result = res.send({ message: "Data Added to Server" });

	  const result = await books.insertOne(newBook);
	  // console.log(result)
	  res.send(result);
	});










app.listen(port, () => {
    console.log(`Server is running on port ${port}`)
})


export default app;