# resilience-patterns-demo

> **Auteure : Takwa Mhana**  
> Demonstration des patterns de resilience **Circuit Breaker** et **Bulkhead** implementes en TypeScript pur, sans dependances runtime.

---

## Patterns implementes

| Pattern | Probleme resolu | Mecanisme |
|---|---|---|
| **Circuit Breaker** | Hammering d'un service defaillant | Court-circuite les appels apres N echecs |
| **Bulkhead** | Epuisement du pool de ressources | Isole les ressources par service |

---

## Prerequis

- **Node.js** >= 18
- **npm** >= 9

```bash
node --version   # v18+
npm --version    # 9+
```

---

## Demarrage rapide

```bash
# 1. Cloner le depot
git clone https://github.com/TakwaMhana/resilience-patterns-demo.git
cd resilience-patterns-demo

# 2. Installer les dependances de developpement
npm install

# 3. Lancer la demo complete
npm start
```

### Autres commandes

```bash
npm run build   # Compile TypeScript -> dist/
npm run dev     # Mode watch (rechargement automatique)
```

---

## Structure du projet

```
resilience-patterns-demo/
├── resilience-patterns.ts       # Bulkhead + CircuitBreaker + ResilientClient + demo
├── package.json
├── tsconfig.json
├── package-lock.json             # Cree apres `npm install`
└── README.md
```

Le fichier principal est **`resilience-patterns.ts`** — un seul fichier TypeScript autonome contenant :
- La classe `Bulkhead` (pool de concurrence isole)
- La classe `CircuitBreaker` (machine a 3 etats : CLOSED / OPEN / HALF_OPEN)
- La classe `ResilientClient` (combinaison des deux patterns)
- La fonction `runDemo()` (simulation end-to-end)

---

## Sortie console attendue

```
╔══════════════════════════════════╗
║        DEMO BULKHEAD             ║
╚══════════════════════════════════╝

→ Saturation du pool email (6 requetes simultanees)...

  [Bulkhead:email] Tache lancee (1/2 actifs)
  [Bulkhead:email] Tache lancee (2/2 actifs)
  email 3: REJETE — pool plein
  email 4: REJETE — pool plein
  ...
  Resultat : paiement traite avec succes ✓
  => Le pool email sature n'affecte PAS les paiements (isolation Bulkhead)

╔══════════════════════════════════╗
║      DEMO CIRCUIT BREAKER        ║
╚══════════════════════════════════╝

  Appel 1: ✓ ok (appel #1)
  Appel 2: ✓ ok (appel #2)
  Appel 3: ✗ Erreur — Service indisponible
  [CB:inventory-service] CLOSED → OPEN
  Appel 4: ⚡ Circuit OPEN — reessayer dans 5s

  [Attente 5 s pour expiration du timeout circuit...]

  [CB:inventory-service] OPEN → HALF_OPEN
  Appel 5: ✓ ok  (sonde reussie 1/2)
  Appel 6: ✓ ok  (sonde reussie 2/2)
  [CB:inventory-service] HALF_OPEN → CLOSED
  Appel 7: ✓ ok
  Appel 8: ✓ ok
```

---

## Architecture des patterns

### Circuit Breaker — Machine d'etats

```
           echecs >= seuil
  CLOSED ─────────────────► OPEN
    ▲                         │
    │  succes >= seuil         │ timeout expire
    │                         ▼
    └──────────────────── HALF_OPEN
         sonde reussie
```

### Bulkhead — Pool isole

```
  ┌─ Pool Payment ─┐   ┌─ Pool Email ──┐
  │  2/2 actifs    │   │  SATURE       │
  │  sante: OK     │   │  rejets: oui  │
  └────────────────┘   └───────────────┘
        │ isolation │
        Les deux pools sont completement independants
```

---

## Licence

MIT — Takwa Mhana, 2025-2026
