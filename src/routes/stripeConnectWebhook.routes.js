import express from "express";
import { handleConnectWebhook } from "../controllers/stripeConnect.controller.js";

const router = express.Router();

router.post("/", handleConnectWebhook);

export default router;
