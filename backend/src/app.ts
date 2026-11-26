import cors from "cors";
import express, { type RequestHandler } from "express";
import { z } from "zod";
import { careStore } from "./data";

const actionSchema = z.object({
  action: z.enum(["Facility review needed", "Routine follow-up", "Need ANM guidance"])
});

const followUpSchema = z.object({
  date: z.string().min(3).max(64).optional()
});

const loginSchema = z.object({
  username: z.string().min(3).max(80),
  password: z.string().min(6).max(128)
});

const getToken = (header?: string) => header?.startsWith("Bearer ") ? header.slice(7) : undefined;
const pathParam = (value: string | string[]) => Array.isArray(value) ? value[0] ?? "" : value;

const requireRole = (...roles: Array<"asha" | "patient">): RequestHandler => (request, response, next) => {
  const token = getToken(request.header("authorization"));
  const user = token ? careStore.sessionUser(token) : undefined;
  if (!user) return response.status(401).json({ error: "Sign in is required" });
  if (!roles.includes(user.role)) return response.status(403).json({ error: "This account cannot access this page" });
  response.locals.user = user;
  next();
};

export function createApp() {
  const app = express();
  const origins = (process.env.FRONTEND_ORIGIN ?? "http://localhost:3000").split(",");

  app.use(cors({ origin: origins }));
  app.use(express.json());

  app.get("/api/health", (_request, response) => response.json({ status: "ok", service: "sehat-saheli-api" }));
  app.post("/api/auth/login", (request, response) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: "Enter a valid username and password" });
    const session = careStore.authenticate(parsed.data.username, parsed.data.password);
    if (!session) return response.status(401).json({ error: "The demo login details do not match" });
    return response.json(session);
  });

  app.get("/api/dashboard", requireRole("asha"), (_request, response) => response.json(careStore.dashboard()));
  app.get("/api/cases", requireRole("asha"), (_request, response) => response.json({ cases: careStore.listCases() }));

  app.get("/api/asha/me", requireRole("asha"), (_request, response, next) => {
    try {
      response.json(careStore.getAshaProfile(response.locals.user.id));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/patient/me", requireRole("patient"), (_request, response, next) => {
    try {
      response.json(careStore.getPatientProfile(response.locals.user.id));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/patient/me/callbacks", requireRole("patient"), (_request, response, next) => {
    try {
      response.status(201).json(careStore.createPatientCallback(response.locals.user.id));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId", requireRole("asha"), (request, response, next) => {
    try {
      response.json(careStore.getCase(pathParam(request.params.caseId)));
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/cases/:caseId/action", requireRole("asha"), (request, response, next) => {
    const parsed = actionSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: "Invalid care action", details: parsed.error.flatten() });
    try {
      response.json(careStore.recordAction(pathParam(request.params.caseId), parsed.data.action));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/referrals/:referralId/acknowledge", requireRole("asha"), (request, response, next) => {
    try {
      response.json(careStore.acknowledgeReferral(pathParam(request.params.referralId)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/cases/:caseId/follow-ups", requireRole("asha"), (request, response, next) => {
    const parsed = followUpSchema.safeParse(request.body ?? {});
    if (!parsed.success) return response.status(400).json({ error: "Invalid follow-up date", details: parsed.error.flatten() });
    try {
      response.status(201).json(careStore.scheduleFollowUp(pathParam(request.params.caseId), parsed.data.date));
    } catch (error) {
      next(error);
    }
  });

  app.use((_request, response) => response.status(404).json({ error: "Route not found" }));
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    const status = message.endsWith("not found") ? 404 : 500;
    response.status(status).json({ error: message });
  });

  return app;
}
