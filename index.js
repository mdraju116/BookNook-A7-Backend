import express from "express"
import cors from "cors";
import 'dotenv/config'
import { MongoClient, ObjectId } from 'mongodb';
import { jwtVerify, createRemoteJWKSet } from 'jose'

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
const connectedClient = await connectToMongoDB();

// connect/create database user(db) and collection
const database = connectedClient.db("booknook-db1");
const books = database.collection("books");
const borrows= database.collection("borrows");

//verify jwt token 
const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).send({ message: "Unauthorized access" });
    }

    const token = authHeader.split(" ")[1];

    // console.log(token);

    const frontendURL =
      process.env.NODE_ENV === "production"
        ? process.env.FRONTEND_URL_VERCEL
        : process.env.FRONTEND_URL_LOCAL;

    const JWKS = createRemoteJWKSet(
      new URL(`${frontendURL}/api/auth/jwks`)
    );


    const { payload } = await jwtVerify(token, JWKS);

    req.user = payload;
    // console.log(payload);
    next();
  } catch (error) {
    console.error("Token validation failed:", error);

    return res.status(401).send({
      message: "Invalid or expired token",
    });
  }
}


//server homepage : http://localhost:5000/
app.get('/', (req, res) => {
  res.send('Welcome to BookNook Server')
})


//http://localhost:5000/add-book
app.post("/add-book", verifyToken, async (req, res) => {
  const newBook = req.body;
  const result = await books.insertOne(newBook);
  res.send(result);
});


// http://localhost:5000/books  (all-books)
app.get("/books", async (req, res) => {
  try {
    const allBooks = await books.find({}).toArray();
    res.status(200).send(allBooks);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch books",
      error: error.message,
    });
  }
});

//http://localhost:5000/books/id  (bookdetails)
app.get("/books/:id", async (req, res) => {
  const id = req.params.id;
  const query = { _id: new ObjectId(id) };
  const result = await books.findOne(query);
  res.send(result);
})

//http://localhost:5000/new-arrivals (latest 6 books)
app.get("/new-arrivals", async (req, res) => {
  const newBooks = await books.find().sort({ _id: -1 }).limit(6).toArray();
  res.send(newBooks);
});

//http://localhost:5000/my-books    (only get the books added by the logedIn user)
app.get("/my-books", verifyToken, async (req, res) => {
  try {
    const userId = req.user.sub;
    const myBooks = await books.find({ "addedBy.userId": userId }).toArray();
    res.status(200).send(myBooks);
  } catch (error) {
    console.error("My-books API error:", error);
    res.status(500).send({ message: "Failed to retrieve your books", });
  }
});


//http://localhost:5000/books/id  (update book)
app.patch("/books/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.user.sub;
    const updateBook = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid book ID" });
    }

    const filter = { _id: new ObjectId(id), "addedBy.userId": userId, };
    const updateDoc = {
      $set: {
        title: updateBook.title,
        author: updateBook.author,
        category: updateBook.category,
        description: updateBook.description,
        image: updateBook.image,
      },
    };
    const result = await books.updateOne(filter, updateDoc);

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Book not found or you are not authorized to update it.", });
    }
    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to update book" });
  }
});



// http://localhost:5000/books/id   (delete book)
app.delete("/books/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.user.sub;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid book ID" });
    }

    const query = { _id: new ObjectId(id), "addedBy.userId": userId, };
    const result = await books.deleteOne(query);

    if (result.deletedCount === 0) {
      return res.status(404).send({ message: "Book not found or you are not authorized to delete it.", });
    }

    res.send(result);
  } catch (error) {
    res.status(500).send({ message: "Failed to delete book" });
  }
});


//http://localhost:5000/borrows    (add book to borrow)
app.post("/borrows", verifyToken, async (req, res) => {
  const newBorrow = req.body;
  const result = await borrows.insertOne(newBorrow);
  res.send(result);
});


//http://localhost:5000/borrows    (only get the books added by the logedIn user)
app.get("/my-books", verifyToken, async (req, res) => {
  try {
    const userId = req.user.sub;
    const myBooks = await books.find({ "addedBy.userId": userId }).toArray();
    res.status(200).send(myBooks);
  } catch (error) {
    console.error("My-books API error:", error);
    res.status(500).send({ message: "Failed to retrieve your books", });
  }
});




app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})


export default app;