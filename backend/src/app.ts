import cors from "cors";
import express, { type RequestHandler } from "express";
import { z } from "zod";
import { careStore } from "./data";
import type { UserRole } from "./types";

const actionSchema = z.object({
  action: z.enum(["Facility review needed", "Routine follow-up", "Need ANM guidance"])
});

const followUpSchema = z.object({
  date: z.string().min(3).max(64).optional()
});

const createCaseSchema = z.object({
  patientId: z.string().min(2).max(64),
  context: z.string().min(2).max(160),
  scheduledFor: z.string().min(2).max(64).optional(),
  tone: z.enum(["urgent", "warm", "blue", "violet"]).optional(),
  tag: z.string().min(2).max(40).optional()
});

const createReferralSchema = z.object({
  facility: z.string().min(2).max(120).optional(),
  reason: z.string().min(2).max(200).optional()
});

const intakeVisitSchema = z.object({
  name: z.string().min(2).max(100),
  age: z.coerce.number().int().min(0).max(120),
  aadhaar: z.string().min(12).max(20),
  description: z.string().min(2).max(300)
});

const loginSchema = z.object({
  username: z.string().min(2).max(80),
  password: z.string().min(4).max(128)
});

const getToken = (header?: string) => header?.startsWith("Bearer ") ? header.slice(7) : undefined;
const pathParam = (value: string | string[]) => Array.isArray(value) ? value[0] ?? "" : value;

const requireRole = (...roles: UserRole[]): RequestHandler => async (request, response, next) => {
  try {
    const token = getToken(request.header("authorization"));
    const user = token ? await careStore.sessionUser(token) : undefined;
    if (!user) return response.status(401).json({ error: "Sign in is required" });
    if (!roles.includes(user.role)) return response.status(403).json({ error: "This account cannot access this page" });
    response.locals.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

export function createApp() {
  const app = express();
  const origins = (process.env.FRONTEND_ORIGIN ?? "http://localhost:3000").split(",");

  app.use(cors({ origin: origins }));
  app.use(express.json());

  app.get("/api/health", (_request, response) => response.json({ status: "ok", service: "sehat-saheli-api" }));

  app.post("/api/auth/login", async (request, response, next) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: "Enter a valid username and password" });
    try {
      const session = await careStore.authenticate(parsed.data.username, parsed.data.password);
      if (!session) return response.status(401).json({ error: "The demo login details do not match" });
      return response.json(session);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/dashboard", requireRole("asha"), async (_request, response, next) => {
    try {
      response.json(await careStore.dashboard(response.locals.user.fullName));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/phc/dashboard", requireRole("phc"), async (_request, response, next) => {
    try {
      response.json(await careStore.phcDashboard());
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases", requireRole("asha", "phc"), async (_request, response, next) => {
    try {
      response.json({ cases: await careStore.listCases() });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/cases", requireRole("asha"), async (request, response, next) => {
    const parsed = createCaseSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: "Invalid care case details", details: parsed.error.flatten() });
    try {
      response.status(201).json(await careStore.createCase(parsed.data));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/intake/visit", requireRole("asha"), async (request, response, next) => {
    const parsed = intakeVisitSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: "Invalid visit intake details", details: parsed.error.flatten() });
    try {
      response.status(201).json(await careStore.ingestVisitFromIntake({ ...parsed.data, source: "web" }));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/asha/me", requireRole("asha"), async (_request, response, next) => {
    try {
      response.json(await careStore.getAshaProfile(response.locals.user.id));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/patient/me", requireRole("patient"), async (_request, response, next) => {
    try {
      response.json(await careStore.getPatientProfile(response.locals.user.id));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/patient/me/callbacks", requireRole("patient"), async (_request, response, next) => {
    try {
      response.status(201).json(await careStore.createPatientCallback(response.locals.user.id));
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/cases/:caseId", requireRole("asha", "phc"), async (request, response, next) => {
    try {
      response.json(await careStore.getCase(pathParam(request.params.caseId)));
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/cases/:caseId/action", requireRole("asha"), async (request, response, next) => {
    const parsed = actionSchema.safeParse(request.body);
    if (!parsed.success) return response.status(400).json({ error: "Invalid care action", details: parsed.error.flatten() });
    try {
      response.json(await careStore.recordAction(pathParam(request.params.caseId), parsed.data.action));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/referrals/:referralId/acknowledge", requireRole("asha", "phc"), async (request, response, next) => {
    try {
      response.json(await careStore.acknowledgeReferral(pathParam(request.params.referralId)));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/cases/:caseId/follow-ups", requireRole("asha", "phc"), async (request, response, next) => {
    const parsed = followUpSchema.safeParse(request.body ?? {});
    if (!parsed.success) return response.status(400).json({ error: "Invalid follow-up date", details: parsed.error.flatten() });
    try {
      response.status(201).json(await careStore.scheduleFollowUp(pathParam(request.params.caseId), parsed.data.date));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/cases/:caseId/referrals", requireRole("asha"), async (request, response, next) => {
    const parsed = createReferralSchema.safeParse(request.body ?? {});
    if (!parsed.success) return response.status(400).json({ error: "Invalid referral details", details: parsed.error.flatten() });
    try {
      response.status(201).json(await careStore.createReferral(pathParam(request.params.caseId), parsed.data.facility, parsed.data.reason));
    } catch (error) {
      next(error);
    }
  });

  app.patch("/api/requests/:requestId", requireRole("asha"), async (request, response, next) => {
    try {
      response.json(await careStore.resolveCallbackRequest(pathParam(request.params.requestId)));
    } catch (error) {
      next(error);
    }
  });

  app.use((_request, response) => response.status(404).json({ error: "Route not found" }));
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    const status = message.endsWith("not found") ? 404 : message.startsWith("Invalid Aadhaar") ? 400 : 500;
    response.status(status).json({ error: message });
  });

  return app;
}
