import express from "express";
import dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";

dotenv.config();
const app = express();

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

app.use(express.json());

const client = new MongoClient(MONGO_URI);
let db;

// helper: safe error
function handleServerError(res, err) {
  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
}

// helper: validate objectId
function validateId(res, id) {
  if (!ObjectId.isValid(id)) {
    res.status(400).json({ error: "Invalid item id" });
    return false;
  }
  return true;
}

// helper: basic validation for item
// required fields for creating/updating:
const REQUIRED_FIELDS = ["name", "price", "category"];

function validateRequiredFields(res, body) {
  const missing = REQUIRED_FIELDS.filter(
    (f) => body[f] === undefined || body[f] === null || body[f] === "",
  );
  if (missing.length > 0) {
    res.status(400).json({ error: "Missing required fields", missing });
    return false;
  }

  if (typeof body.name !== "string") {
    res.status(400).json({ error: "Field 'name' must be a string" });
    return false;
  }
  if (typeof body.category !== "string") {
    res.status(400).json({ error: "Field 'category' must be a string" });
    return false;
  }
  if (
    typeof body.price !== "number" ||
    Number.isNaN(body.price) ||
    body.price < 0
  ) {
    res
      .status(400)
      .json({ error: "Field 'price' must be a non-negative number" });
    return false;
  }

  return true;
}

function validatePatchFields(res, body) {
  const allowed = ["name", "price", "category", "description"];
  const keys = Object.keys(body);

  if (keys.length === 0) {
    res.status(400).json({ error: "PATCH body cannot be empty" });
    return false;
  }

  const invalid = keys.filter((k) => !allowed.includes(k));
  if (invalid.length > 0) {
    res
      .status(400)
      .json({ error: "Invalid fields in PATCH", invalid, allowed });
    return false;
  }

  if (body.name !== undefined && typeof body.name !== "string") {
    res.status(400).json({ error: "Field 'name' must be a string" });
    return false;
  }
  if (body.category !== undefined && typeof body.category !== "string") {
    res.status(400).json({ error: "Field 'category' must be a string" });
    return false;
  }
  if (body.price !== undefined) {
    if (
      typeof body.price !== "number" ||
      Number.isNaN(body.price) ||
      body.price < 0
    ) {
      res
        .status(400)
        .json({ error: "Field 'price' must be a non-negative number" });
      return false;
    }
  }
  if (body.description !== undefined && typeof body.description !== "string") {
    res.status(400).json({ error: "Field 'description' must be a string" });
    return false;
  }

  return true;
}

// Root
app.get("/", (req, res) => {
  res.json({ message: "Items API is running" });
});

// GET /api/items - retrieve all items
app.get("/api/items", async (req, res) => {
  try {
    const items = await db.collection("items").find({}).toArray();
    res.status(200).json({ count: items.length, items });
  } catch (err) {
    return handleServerError(res, err);
  }
});

// GET /api/items/:id - retrieve item by ID
app.get("/api/items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateId(res, id)) return;

    const item = await db
      .collection("items")
      .findOne({ _id: new ObjectId(id) });
    if (!item) return res.status(404).json({ error: "Item not found" });

    res.status(200).json(item);
  } catch (err) {
    return handleServerError(res, err);
  }
});

// POST /api/items - create a new item
app.post("/api/items", async (req, res) => {
  try {
    const { name, price, category, description } = req.body;

    if (!validateRequiredFields(res, { name, price, category })) return;

    const result = await db.collection("items").insertOne({
      name,
      price,
      category,
      description: description ?? "",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    res.status(201).json({
      message: "Item created",
      id: result.insertedId,
    });
  } catch (err) {
    return handleServerError(res, err);
  }
});

// PUT /api/items/:id - full update
app.put("/api/items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateId(res, id)) return;

    const { name, price, category, description } = req.body;

    // PUT = full update => required fields must exist
    if (!validateRequiredFields(res, { name, price, category })) return;

    const result = await db.collection("items").updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          name,
          price,
          category,
          description: description ?? "",
          updatedAt: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.status(200).json({ message: "Item fully updated" });
  } catch (err) {
    return handleServerError(res, err);
  }
});

// PATCH /api/items/:id - partial update
app.patch("/api/items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateId(res, id)) return;

    const patchData = req.body;
    if (!validatePatchFields(res, patchData)) return;

    patchData.updatedAt = new Date();

    const result = await db
      .collection("items")
      .updateOne({ _id: new ObjectId(id) }, { $set: patchData });

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    res.status(200).json({ message: "Item partially updated" });
  } catch (err) {
    return handleServerError(res, err);
  }
});

// DELETE /api/items/:id - delete an item
app.delete("/api/items/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateId(res, id)) return;

    const result = await db
      .collection("items")
      .deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Item not found" });
    }

    // 204 = no content
    res.status(204).send();
  } catch (err) {
    return handleServerError(res, err);
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
});

// Start server + connect DB
async function startServer() {
  try {
    await client.connect();
    db = client.db("shop");
    console.log("Connected to MongoDB");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}

startServer();
