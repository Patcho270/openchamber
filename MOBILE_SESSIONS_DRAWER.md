# Mobile Sessions Drawer — Méthodo de restauration

## Contexte

Patch custom pour OpenChamber qui remplace le drawer de sessions mobile par un panel plein écran avec animation swipe (style ChatGPT).

**Commits :**
- `b39f13d5` — feat: add mobile sessions swipe drawer
- `32515634` — feat: mobile sessions swipe drawer with full-screen panel

**Fichiers modifiés (4) :**
- `packages/ui/src/apps/MobileApp.tsx` — swipe open/close, touch handlers, scroll lock
- `packages/ui/src/apps/MobileSessionsSheet.tsx` — reveal progress, parallax, panelOffsetX
- `packages/ui/src/apps/MobileSurfaceShell.tsx` — leftDrawerOffsetX, mode left-drawer
- `packages/ui/src/components/layout/MainLayout.tsx` — ?surface=desktop query param

**Patch :** `mobile-sessions-drawer.patch` (racine du repo)

---

## Après une mise à jour upstream

### Option A — Réappliquer le patch (recommandé)

```bash
cd /path/to/openchamber
git stash  # si tu as des mods locaux

# Mettre à jour upstream
git fetch origin main
git merge origin main

# Réappliquer le patch
git apply --3way mobile-sessions-drawer.patch

# Vérifier
PATH="/Users/hyacinthe/.bun/bin:$PATH" bun run --cwd packages/ui type-check
PATH="/Users/hyacinthe/.bun/bin:$PATH" bun run --cwd packages/ui lint
PATH="/Users/hyacinthe/.bun/bin:$PATH" bun run build:web
```

Si conflits (`git apply --3way` les montre), corriger manuellement les fichiers concernés, puis :
```bash
git add packages/ui/src/apps/MobileApp.tsx packages/ui/src/apps/MobileSessionsSheet.tsx packages/ui/src/apps/MobileSurfaceShell.tsx packages/ui/src/components/layout/MainLayout.tsx
git commit -m "feat: reapply mobile sessions drawer patch"
```

### Option B — Repull ton fork

Si le patch est déjà sur ton fork (Patcho270/openchamber) :
```bash
git remote add fork https://github.com/Patcho270/openchamber.git
git fetch fork main
git merge fork/main
```

### Option C — Régression manuelle

Si le patch ne s'applique plus du tout (trop de changements upstream), il faut re-porter. Les modifications essentielles sont :

1. **MobileApp.tsx** — Ajouter les touch handlers (`handleChatCardTouchStart/Move/End`), `beginTransition/endTransition`, `lockScroll/unlockScroll`, le gesture edge detection
2. **MobileSessionsSheet.tsx** — Props `revealProgress`, `panelOffsetX`, `isTransitioning`, parallax sur le contenu
3. **MobileSurfaceShell.tsx** — Mode `left-drawer` plein écran, `leftDrawerOffsetX`
4. **MainLayout.tsx** — Query param `?surface=desktop`

---

## Rollback complet

Si tu veux revenir à la version upstream :
```bash
git checkout f6f66d5d -- packages/ui/src/apps/MobileApp.tsx packages/ui/src/apps/MobileSessionsSheet.tsx packages/ui/src/apps/MobileSurfaceShell.tsx packages/ui/src/components/layout/MainLayout.tsx
git commit -m "revert: remove mobile sessions drawer custom patch"
```

---

## Notes techniques

- Le scroll lock utilise le pattern body `position: fixed` + `overflow: hidden` (comme les modals)
- Le blocage edge pour le geste d'ouverture utilise un `touchmove` listener global avec `{ passive: false, capture: true }`
- Les animations ciblent `transform`/`opacity` uniquement pour du 120fps
- `will-change` ajouté sur la carte tchat et le contenu sessions
- Le geste retour Android est protégé par un margin de 20px sur le bord gauche
