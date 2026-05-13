/**
 * Demo: compile-time enforced PHI access pipeline.
 *
 * This file demonstrates that the Effect type system mechanically enforces
 * the audit trail. Comment out any Layer to see the compiler refuse to build.
 *
 * Used in the "AI Harness" meetup talk — this is REAL production code,
 * not a contrived example.
 */
import { Effect } from "@sylvan/core";
import {
  requireAuditedPhiAccess,
  makeAuditSinkStub,
  makeAuthContextStub,
  makeObjectAuthorizerStub
} from "@sylvan/phi";
import type { PhiAccessParams } from "@sylvan/phi";

// ── Stub Layers (test doubles, not production) ──────────────────────────

const auditSink = makeAuditSinkStub();
const authContext = makeAuthContextStub({
  permissions: new Set(["phi:read"])
});
const objectAuthorizer = makeObjectAuthorizerStub();

// ── The handler ─────────────────────────────────────────────────────────

const accessPatientRecord = (patientTokenId: string) => {
  const params: PhiAccessParams = {
    permission: "phi:read",
    action: "view-patient-record",
    resourceType: "Patient",
    resourceTokenId: patientTokenId,
    accessReason: "Treatment",
    ipAddress: "10.0.0.1",
    correlationId: "demo-correlation-001"
  };

  return requireAuditedPhiAccess(params);
};

// ── Compose and run ─────────────────────────────────────────────────────
//
// DEMO: Comment out any of these three layers to see the compiler error.
//       The type system enforces that all three services must be provided.
//

const program = accessPatientRecord("phi_patient-demo-001");

const runnable = program.pipe(
  Effect.provide(auditSink.layer), // Try commenting this out!
  Effect.provide(authContext.layer), // Or this one!
  Effect.provide(objectAuthorizer.layer) // Or this one!
);

// Run the program — will succeed because all layers are provided
Effect.runPromise(runnable).then(
  (actor) => console.log("Access granted for:", actor.id),
  (error) => console.error("Access denied:", error)
);
