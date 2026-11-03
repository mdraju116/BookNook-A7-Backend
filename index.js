
import express from "express";
import cors from "cors";
import "dotenv/config";

import { MongoClient, ObjectId } from "mongodb";
import { jwtVerify, createRemoteJWKSet } from "jose";

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());

app.use(
  cors({
    origin: [
      process.env.FRONTEND_URL_LOCAL,
      process.env.FRONTEND_URL_VERCEL,
    ].filter(Boolean),
  })
);


// ==========================================
// 1. CONNECT TO MONGODB
// ==========================================

const client = new MongoClient(process.env.MONGODB_URI);

await client.connect();

console.log("Successfully connected to MongoDB!");

const database = client.db("booknook-db1");

const books = database.collection("books");
const borrows = database.collection("borrows");


// ==========================================
// 2. MIGRATE EXISTING DATA
// ==========================================

async function migrateExistingData() {
  // Existing books without totalCopies get 1 copy
  await books.updateMany(
    { totalCopies: { $exists: false } },
    { $set: { totalCopies: 1 } }
  );

  // Normalize old borrow records
  const oldBorrows = await borrows.find({
    $or: [
      { userId: { $exists: false } },
      { bookId: { $type: "string" } },
    ],
  }).toArray();

  for (const borrow of oldBorrows) {
    const updates = {};

    if (!borrow.userId && borrow.addedBy?.userId) {
      updates.userId = borrow.addedBy.userId;
    }

    if (
      typeof borrow.bookId === "string" &&
      ObjectId.isValid(borrow.bookId)
    ) {
      updates.bookId = new ObjectId(borrow.bookId);
    }

    if (Object.keys(updates).length > 0) {
      await borrows.updateOne(
        { _id: borrow._id },
        { $set: updates }
      );
    }
  }

  // Prevent duplicate active borrowing
  await borrows.createIndex(
    { bookId: 1, userId: 1 },
    { unique: true }
  );

  console.log("Database migration completed!");
}

await migrateExistingData();


// ==========================================
// 3. VERIFY JWT TOKEN
// ==========================================

const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).send({
        message: "Unauthorized access",
      });
    }

    const token = authHeader.split(" ")[1];

    const frontendURL =
      process.env.NODE_ENV === "production"
        ? process.env.FRONTEND_URL_VERCEL
        : process.env.FRONTEND_URL_LOCAL;

    const JWKS = createRemoteJWKSet(
      new URL(`${frontendURL}/api/auth/jwks`)
    );

    const { payload } = await jwtVerify(token, JWKS);

    if (!payload.sub) {
      return res.status(401).send({
        message: "Invalid user token",
      });
    }

    req.user = payload;

    next();

  } catch (error) {
    console.error("Token validation failed:", error);

    return res.status(401).send({
      message: "Invalid or expired token",
    });
  }
};


// ==========================================
// 4. SERVER HOME
// ==========================================

app.get("/", (req, res) => {
  res.send("Welcome to BookNook Server");
});


// ==========================================
// 5. ADD BOOK
// ==========================================

app.post("/add-book", verifyToken, async (req, res) => {
  try {
    const newBook = req.body;

    const { totalCopies } = newBook;

    if (
      !Number.isInteger(totalCopies) ||
      totalCopies <= 0
    ) {
      return res.status(400).send({
        message: "Total copies must be a positive integer.",
      });
    }

    const result = await books.insertOne({
      ...newBook,
      totalCopies,
    });

    res.status(201).send({
      message: "Book added successfully",
      insertedId: result.insertedId,
    });

  } catch (error) {
    console.error("Add book error:", error);

    res.status(500).send({
      message: "Failed to add book",
    });
  }
});


// ==========================================
// 6. GET ALL BOOKS
// ==========================================

app.get("/books", async (req, res) => {
  try {
    const allBooks = await books.find({}).toArray();

    res.status(200).send(allBooks);

  } catch (error) {
    console.error(error);

    res.status(500).send({
      message: "Failed to fetch books",
    });
  }
});


// ==========================================
// 7. GET BOOK DETAILS
// ==========================================

app.get("/books/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid book ID",
      });
    }

    const result = await books.findOne({
      _id: new ObjectId(id),
    });

    if (!result) {
      return res.status(404).send({
        message: "Book not found",
      });
    }

    res.status(200).send(result);

  } catch (error) {
    console.error(error);

    res.status(500).send({
      message: "Failed to fetch book details",
    });
  }
});


// ==========================================
// 8. GET NEW ARRIVALS
// ==========================================

app.get("/new-arrivals", async (req, res) => {
  try {
    const newBooks = await books
      .find()
      .sort({ _id: -1 })
      .limit(6)
      .toArray();

    res.status(200).send(newBooks);

  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch new arrivals",
    });
  }
});


// ==========================================
// 9. GET MY BOOKS
// ==========================================

app.get("/my-books", verifyToken, async (req, res) => {
  try {
    const userId = req.user.sub;

    const myBooks = await books
      .find({ "addedBy.userId": userId })
      .toArray();

    res.status(200).send(myBooks);

  } catch (error) {
    console.error(error);

    res.status(500).send({
      message: "Failed to retrieve your books",
    });
  }
});


// ==========================================
// 10. UPDATE BOOK
// ==========================================

app.patch("/books/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.user.sub;
    const updateBook = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid book ID",
      });
    }

    // Validate totalCopies
    if (
      !Number.isInteger(updateBook.totalCopies) ||
      updateBook.totalCopies <= 0
    ) {
      return res.status(400).send({
        message: "Total copies must be a positive integer.",
      });
    }

    const bookId = new ObjectId(id);

    const filter = {
      _id: bookId,
      "addedBy.userId": userId,
    };

    // Check book ownership and existence
    const existingBook = await books.findOne(filter);

    if (!existingBook) {
      return res.status(404).send({
        message: "Book not found or unauthorized.",
      });
    }

    // Count currently active borrows
    const activeBorrows = await borrows.countDocuments({
      bookId,
    });

    // Prevent reducing total copies below borrowed copies
    if (updateBook.totalCopies < activeBorrows) {
      return res.status(400).send({
        message: `At least ${activeBorrows} copies are currently borrowed.`,
      });
    }

    const updateDoc = {
      $set: {
        title: updateBook.title,
        author: updateBook.author,
        category: updateBook.category,
        description: updateBook.description,
        image: updateBook.image,
        totalCopies: updateBook.totalCopies,
      },
    };

    const result = await books.updateOne(filter, updateDoc);

    res.status(200).send({
      message: "Book updated successfully",
      result,
    });

  } catch (error) {
    console.error("Update book error:", error);

    res.status(500).send({
      message: "Failed to update book",
    });
  }
});


// ==========================================
// 11. DELETE BOOK
// ==========================================

app.delete("/books/:id", verifyToken, async (req, res) => {
  try {
    const id = req.params.id;
    const userId = req.user.sub;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid book ID",
      });
    }

    const bookId = new ObjectId(id);

    // Don't delete a book with active borrows
    const activeBorrows = await borrows.countDocuments({
      bookId,
    });

    if (activeBorrows > 0) {
      return res.status(409).send({
        message: "Cannot delete a book while copies are borrowed.",
      });
    }

    const result = await books.deleteOne({
      _id: bookId,
      "addedBy.userId": userId,
    });

    if (result.deletedCount === 0) {
      return res.status(404).send({
        message: "Book not found or unauthorized.",
      });
    }

    res.status(200).send({
      message: "Book deleted successfully",
    });

  } catch (error) {
    console.error("Delete book error:", error);

    res.status(500).send({
      message: "Failed to delete book",
    });
  }
});


// ==========================================
// 12. BORROW BOOK
// ==========================================

app.post("/borrows", verifyToken, async (req, res) => {
  const session = client.startSession();

  try {
    const userId = req.user.sub;
    const { bookId: requestedBookId } = req.body;

    if (!ObjectId.isValid(requestedBookId)) {
      return res.status(400).send({
        message: "Invalid book ID",
      });
    }

    const bookId = new ObjectId(requestedBookId);

    let borrowId;

    await session.withTransaction(async () => {

      // Check duplicate active borrow
      const existingBorrow = await borrows.findOne(
        { bookId, userId },
        { session }
      );

      if (existingBorrow) {
        const error = new Error(
          "You have already borrowed this book."
        );
        error.status = 409;
        throw error;
      }

      // Atomically decrease available copies
      const updateResult = await books.updateOne(
        {
          _id: bookId,
          totalCopies: { $gt: 0 },
        },
        {
          $inc: { totalCopies: -1 },
        },
        { session }
      );

      if (updateResult.modifiedCount === 0) {
        const error = new Error(
          "Sorry, this book is not available."
        );
        error.status = 409;
        throw error;
      }

      // Insert borrow record
      const newBorrow = {
        bookId,
        userId,
        borrowedAt: new Date(),
      };

      const result = await borrows.insertOne(
        newBorrow,
        { session }
      );

      borrowId = result.insertedId;
    });

    res.status(201).send({
      message: "Book borrowed successfully.",
      insertedId: borrowId,
    });

  } catch (error) {
    console.error("Borrow API error:", error);

    if (error.code === 11000) {
      return res.status(409).send({
        message: "You have already borrowed this book.",
      });
    }

    res.status(error.status || 500).send({
      message: error.status ? error.message : "Failed to borrow book",
    });

  } finally {
    await session.endSession();
  }
});


// ==========================================
// 13. GET MY BORROWS
// ==========================================

app.get("/borrows", verifyToken, async (req, res) => {
  try {
    const userId = req.user.sub;

    const myBorrows = await borrows
      .find({ userId })
      .toArray();

    res.status(200).send(myBorrows);

  } catch (error) {
    console.error("Borrows API error:", error);

    res.status(500).send({
      message: "Failed to retrieve borrowed books",
    });
  }
});


// ==========================================
// 14. RETURN BOOK
// ==========================================

app.delete("/borrows/:id", verifyToken, async (req, res) => {
  const session = client.startSession();

  try {
    const id = req.params.id;
    const userId = req.user.sub;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid borrow ID",
      });
    }

    const borrowId = new ObjectId(id);

    await session.withTransaction(async () => {

      // Find authenticated user's borrow record
      const borrow = await borrows.findOne(
        {
          _id: borrowId,
          userId,
        },
        { session }
      );

      if (!borrow) {
        const error = new Error(
          "Borrow record not found or already returned."
        );
        error.status = 404;
        throw error;
      }

      // Delete borrow record
      const deleteResult = await borrows.deleteOne(
        {
          _id: borrowId,
          userId,
        },
        { session }
      );

      if (deleteResult.deletedCount === 0) {
        const error = new Error(
          "Borrow record not found or already returned."
        );
        error.status = 404;
        throw error;
      }

      // Increase available copies
      await books.updateOne(
        { _id: borrow.bookId },
        { $inc: { totalCopies: 1 } },
        { session }
      );
    });

    res.status(200).send({
      message: "Book returned successfully.",
    });

  } catch (error) {
    console.error("Return book error:", error);

    res.status(error.status || 500).send({
      message: error.status ? error.message : "Failed to return book",
    });

  } finally {
    await session.endSession();
  }
});


// ==========================================
// 15. START SERVER
// ==========================================

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

export default app;
