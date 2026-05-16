// ═══════════════════════════════════════════════════════════════════════════
//  RESILIENCE PATTERNS — Bulkhead & Circuit Breaker
//  Auteure : Takwa Mhana
//  Repo    : https://github.com/TakwaMhana/resilience-patterns-demo
//
//  Execution :  npx ts-node src/resilience-patterns.ts
//               npm start
// ═══════════════════════════════════════════════════════════════════════════

// ───────────────────────────────────────────────────────────────────────────
//  PATTERN 1 — BULKHEAD
//
//  Partitionne le systeme en pools de ressources isoles (concurrence).
//  Si un pool est epuise, les autres continuent de fonctionner —
//  la defaillance ne peut pas se propager entre les services.
// ───────────────────────────────────────────────────────────────────────────

class Bulkhead {
  private readonly name: string;
  private readonly maxConcurrent: number;
  private readonly maxQueueSize: number;

  private activeCount = 0; // taches actives en ce moment
  private queueSize   = 0; // taches en attente d'un slot

  constructor(opts: {
    name: string;
    maxConcurrent: number; // slots paralleles max
    maxQueueSize?: number; // requetes en file d'attente (defaut : 0)
  }) {
    this.name          = opts.name;
    this.maxConcurrent = opts.maxConcurrent;
    this.maxQueueSize  = opts.maxQueueSize ?? 0;
  }

  async execute<T>(task: () => Promise<T>): Promise<T> {
    // Pool sature : tenter la mise en file ou rejeter immediatement
    if (this.activeCount >= this.maxConcurrent) {
      if (this.queueSize >= this.maxQueueSize) {
        throw new BulkheadRejectedError(
          `[Bulkhead:${this.name}] Pool plein — ` +
          `${this.activeCount}/${this.maxConcurrent} actifs, ` +
          `${this.queueSize}/${this.maxQueueSize} en attente.`
        );
      }
      // File disponible — attendre la liberation d'un slot
      this.queueSize++;
      console.log(`  [Bulkhead:${this.name}] En attente (${this.queueSize} en file)`);
      await this.waitForSlot();
      this.queueSize--;
    }

    // Executer la tache dans le slot acquis
    this.activeCount++;
    console.log(
      `  [Bulkhead:${this.name}] Tache lancee ` +
      `(${this.activeCount}/${this.maxConcurrent} actifs)`
    );

    try {
      return await task();
    } finally {
      this.activeCount--; // liberer le slot dans tous les cas
    }
  }

  /** Polling toutes les 10 ms jusqu'a liberation d'un slot. */
  private waitForSlot(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.activeCount < this.maxConcurrent) {
          resolve();
        } else {
          setTimeout(check, 10);
        }
      };
      check();
    });
  }

  get stats() {
    return {
      name:          this.name,
      active:        this.activeCount,
      queued:        this.queueSize,
      maxConcurrent: this.maxConcurrent,
    };
  }
}

class BulkheadRejectedError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "BulkheadRejectedError";
  }
}


// ───────────────────────────────────────────────────────────────────────────
//  PATTERN 2 — CIRCUIT BREAKER
//
//  Machine a trois etats :
//    CLOSED    — operation normale ; les echecs sont comptes.
//    OPEN      — trop d'echecs ; tous les appels sont court-circuites.
//    HALF_OPEN — apres un timeout, une requete sonde est autorisee
//                pour tester si le service s'est recupere.
// ───────────────────────────────────────────────────────────────────────────

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

class CircuitBreaker {
  private readonly name:             string;
  private readonly failureThreshold: number; // echecs avant ouverture
  private readonly successThreshold: number; // succes consecutifs pour refermer
  private readonly timeout:          number; // ms avant passage en HALF_OPEN

  private state:         CircuitState = "CLOSED";
  private failureCount = 0;
  private successCount = 0;
  private nextAttemptAt = 0;

  constructor(opts: {
    name:              string;
    failureThreshold?: number;
    successThreshold?: number;
    timeout?:          number;
  }) {
    this.name             = opts.name;
    this.failureThreshold = opts.failureThreshold ?? 3;
    this.successThreshold = opts.successThreshold ?? 2;
    this.timeout          = opts.timeout ?? 5_000;
  }

  async execute<T>(task: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (Date.now() < this.nextAttemptAt) {
        throw new CircuitOpenError(
          `[CB:${this.name}] OPEN — ` +
          `reessayer dans ${Math.ceil((this.nextAttemptAt - Date.now()) / 1000)}s`
        );
      }
      // Timeout ecoule : autoriser une requete sonde
      this.transitionTo("HALF_OPEN");
    }

    try {
      const result = await task();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === "HALF_OPEN") {
      this.successCount++;
      console.log(
        `  [CB:${this.name}] Sonde HALF_OPEN reussie ` +
        `(${this.successCount}/${this.successThreshold})`
      );
      if (this.successCount >= this.successThreshold) {
        this.transitionTo("CLOSED");
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;
    console.log(
      `  [CB:${this.name}] Echec enregistre ` +
      `(${this.failureCount}/${this.failureThreshold})`
    );

    if (this.state === "HALF_OPEN") {
      // La sonde a echoue : retour immediat en OPEN
      this.transitionTo("OPEN");
      return;
    }

    if (this.failureCount >= this.failureThreshold) {
      this.transitionTo("OPEN");
    }
  }

  private transitionTo(next: CircuitState): void {
    if (next === "OPEN") {
      this.nextAttemptAt = Date.now() + this.timeout;
      this.successCount  = 0;
    }
    if (next === "CLOSED") {
      this.failureCount = 0;
      this.successCount = 0;
    }
    console.log(`  [CB:${this.name}] ${this.state} → ${next}`);
    this.state = next;
  }

  get stats() {
    return {
      name:      this.name,
      state:     this.state,
      failures:  this.failureCount,
      successes: this.successCount,
    };
  }
}

class CircuitOpenError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "CircuitOpenError";
  }
}


// ───────────────────────────────────────────────────────────────────────────
//  COMBINAISON — ResilientClient
//
//  Le Bulkhead protege les ressources (concurrence).
//  Le Circuit Breaker protege le service aval (echecs).
//  Ensemble, ils preventent :
//    • L'epuisement du pool de threads/connexions  (Bulkhead)
//    • Le martellement d'un service defaillant      (Circuit Breaker)
// ───────────────────────────────────────────────────────────────────────────

class ResilientClient {
  private bulkhead: Bulkhead;
  private breaker:  CircuitBreaker;

  constructor(serviceName: string) {
    this.bulkhead = new Bulkhead({
      name:          serviceName,
      maxConcurrent: 5,
      maxQueueSize:  10,
    });

    this.breaker = new CircuitBreaker({
      name:             serviceName,
      failureThreshold: 3,    // ouvre apres 3 echecs
      successThreshold: 2,    // referme apres 2 succes en HALF_OPEN
      timeout:          5_000, // reste OPEN 5 secondes
    });
  }

  async call<T>(task: () => Promise<T>): Promise<T> {
    // Ordre important : Bulkhead (ressources) -> Circuit Breaker (service aval)
    return this.bulkhead.execute(() => this.breaker.execute(task));
  }

  get stats() {
    return { bulkhead: this.bulkhead.stats, breaker: this.breaker.stats };
  }
}


// ───────────────────────────────────────────────────────────────────────────
//  DEMO — execution end-to-end des deux patterns
// ───────────────────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Simule un service qui reussit les N premiers appels puis echoue. */
function makeUnreliableService(failAfter: number) {
  let callCount = 0;
  return async () => {
    callCount++;
    await delay(50); // simule la latence reseau
    if (callCount > failAfter) {
      throw new Error("Service indisponible (erreur aval)");
    }
    return `ok (appel #${callCount})`;
  };
}

async function runDemo() {

  // ── DEMO 1 : BULKHEAD ──────────────────────────────────────────
  console.log("\n╔══════════════════════════════════╗");
  console.log("║        DEMO BULKHEAD             ║");
  console.log("╚══════════════════════════════════╝\n");

  const paymentBulkhead = new Bulkhead({ name: "payment", maxConcurrent: 2, maxQueueSize: 1 });
  const emailBulkhead   = new Bulkhead({ name: "email",   maxConcurrent: 2, maxQueueSize: 0 });

  console.log("→ Saturation du pool email (6 requetes simultanees)...\n");
  const requests = Array.from({ length: 6 }, (_, i) => i + 1);

  await Promise.allSettled(
    requests.map(async (i) => {
      try {
        await emailBulkhead.execute(() => delay(200));
        console.log(`  email ${i}: traite avec succes`);
      } catch (e) {
        if (e instanceof BulkheadRejectedError) {
          console.log(`  email ${i}: REJETE — pool plein`);
        }
      }
    })
  );

  console.log("\n→ Paiement tente pendant la saturation des emails...");
  const payResult = await paymentBulkhead.execute(() =>
    Promise.resolve("paiement traite avec succes ✓")
  );
  console.log(`\n  Resultat : ${payResult}`);
  console.log("  => Le pool email sature n'affecte PAS les paiements (isolation Bulkhead)\n");

  // ── DEMO 2 : CIRCUIT BREAKER ───────────────────────────────────
  console.log("\n╔══════════════════════════════════╗");
  console.log("║      DEMO CIRCUIT BREAKER        ║");
  console.log("╚══════════════════════════════════╝\n");

  const client  = new ResilientClient("inventory-service");
  const service = makeUnreliableService(2); // echoue apres le 2e appel

  console.log("→ Envoi de 8 appels (le service echoue apres le 2e appel)...\n");

  for (let i = 1; i <= 8; i++) {
    await delay(200);
    try {
      const res = await client.call(service);
      console.log(`  Appel ${i}: ✓ ${res}`);
    } catch (e) {
      if (e instanceof CircuitOpenError) {
        console.log(`  Appel ${i}: ⚡ Circuit OPEN — ${(e as Error).message}`);
      } else {
        console.log(`  Appel ${i}: ✗ Erreur — ${(e as Error).message}`);
      }
    }

    // Apres l'appel 4, attendre l'expiration du timeout du circuit breaker
    if (i === 4) {
      console.log("\n  [Attente 5 s pour expiration du timeout circuit...]\n");
      await delay(5_100);
    }
  }

  console.log("\n  Stats finales :");
  console.log(JSON.stringify(client.stats, null, 2));
}

runDemo().catch(console.error);
