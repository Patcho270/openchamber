import React from 'react';
import {
  RiFileTextLine,
  RiGitBranchLine,
  RiMenuLine,
  RiMore2Line,
  RiSettings3Line,
} from '@remixicon/react';

import { ChatView } from '@/components/views/ChatView';
import { SettingsView } from '@/components/views/SettingsView';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { RuntimeAPIProvider } from '@/contexts/RuntimeAPIProvider';
import { registerRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { usePushVisibilityBeacon } from '@/hooks/usePushVisibilityBeacon';
import { useRouter } from '@/hooks/useRouter';
import { useWindowTitle } from '@/hooks/useWindowTitle';
import { opencodeClient } from '@/lib/opencode/client';
import type { RuntimeAPIs } from '@/lib/api/types';
import { useI18n } from '@/lib/i18n';
import { runtimeFetch } from '@/lib/runtime-fetch';
import { cn } from '@/lib/utils';
import { useConfigStore } from '@/stores/useConfigStore';
import { useDirectoryStore } from '@/stores/useDirectoryStore';
import { useFeatureFlagsStore } from '@/stores/useFeatureFlagsStore';
import { useGitHubAuthStore } from '@/stores/useGitHubAuthStore';
import { useGitStatus, useGitStore } from '@/stores/useGitStore';
import { useProjectsStore } from '@/stores/useProjectsStore';
import { listProjectWorktrees } from '@/lib/worktrees/worktreeManager';
import type { WorktreeMetadata } from '@/types/worktree';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { SyncProvider, useSession } from '@/sync/sync-context';

import { SyncAppEffects } from './AppEffects';
import { MobileChangesSurface } from './MobileChangesSurface';
import { MobileFilesSurface } from './MobileFilesSurface';
import { MobileSessionsSheet } from './MobileSessionsSheet';
import { MobileSurfaceShell } from './MobileSurfaceShell';
import { DedicatedMobileAppProvider, type MobileAppActions } from './mobileAppContext';
import { useAppFontEffects } from './useAppFontEffects';

const MOBILE_SETTINGS_PAGES = [
  'appearance',
  'chat',
  'notifications',
  'sessions',
  'git',
  'magic-prompts',
  'behavior',
  'mcp',
  'providers',
  'usage',
  'voice',
] as const;

type MobileAppProps = {
  apis: RuntimeAPIs;
};

const normalizePath = (value?: string | null): string =>
  (value || '').replace(/\\/g, '/').replace(/\/+$/g, '');

const getProjectLabel = (path: string): string => {
  const normalized = normalizePath(path);
  if (!normalized) return '';
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1]?.replace(/[-_]/g, ' ') || normalized;
};

type OverflowItem = {
  key: 'files' | 'changes' | 'settings';
  Icon: typeof RiFileTextLine;
  label: string;
  badge?: number;
  onSelect: () => void;
};

const MobileOverflowMenu: React.FC<{
  open: boolean;
  onClose: () => void;
  items: OverflowItem[];
}> = ({ open, onClose, items }) => {
  const { t } = useI18n();
  React.useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={t('mobile.menu.titleAria')}>
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label={t('mobile.surface.closeAria')}
        onClick={onClose}
      />
      <div
        className="absolute right-2 top-[calc(var(--oc-safe-area-top,0px)+56px+4px)] w-[min(220px,calc(100vw-1rem))] origin-top-right overflow-hidden rounded-2xl border border-border/40 bg-background shadow-[0_18px_60px_rgb(0_0_0_/_0.35)]"
        role="menu"
        style={{ animation: 'mobile-menu-in 160ms cubic-bezier(0.32, 0.72, 0, 1)' }}
      >
        {items.map((item, index) => (
          <button
            key={item.key}
            type="button"
            role="menuitem"
            className={cn(
              'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset',
              index > 0 && 'border-t border-border/30',
            )}
            style={{ touchAction: 'manipulation' }}
            onClick={() => {
              item.onSelect();
              onClose();
            }}
          >
            <item.Icon className="size-5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate typography-ui-label text-foreground">{item.label}</span>
            {item.badge && item.badge > 0 ? (
              <span className="inline-flex size-2 shrink-0 rounded-full bg-primary" aria-hidden />
            ) : null}
          </button>
        ))}
      </div>
      <style>{`@keyframes mobile-menu-in { from { opacity: 0; transform: translateY(-6px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>
    </div>
  );
};

const MobileHeader: React.FC<{
  onOpenSessions: () => void;
  onOpenMenu: () => void;
}> = ({ onOpenSessions, onOpenMenu }) => {
  const { t } = useI18n();
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const projects = useProjectsStore((state) => state.projects);
  const currentSession = useSession(currentSessionId, currentDirectory || undefined);

  const projectLabel = React.useMemo(() => {
    const directory = normalizePath(currentDirectory);
    if (!directory) return t('mobile.header.noProject');
    const project = projects.find((entry) => {
      const projectPath = normalizePath(entry.path);
      return directory === projectPath || directory.startsWith(`${projectPath}/`);
    });
    return project?.label?.trim() || getProjectLabel(project?.path || directory);
  }, [currentDirectory, projects, t]);

  const sessionTitle = currentSession?.title?.trim();
  const primaryLabel = sessionTitle || projectLabel;
  const secondaryLabel = sessionTitle ? projectLabel : currentSessionId ? t('mobile.sessions.untitled') : '';

  return (
    <header
      className="relative z-30 flex shrink-0 items-center gap-1 border-b border-border/30 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
      style={{ paddingTop: 'var(--oc-safe-area-top, 0px)' }}
    >
      <div className="flex h-[var(--oc-header-height,56px)] w-full items-center gap-1 px-2">
        <button
          type="button"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={t('mobile.sessions.openSheetAria')}
          onClick={onOpenSessions}
          style={{ touchAction: 'manipulation' }}
        >
          <RiMenuLine className="size-5" />
        </button>

        <button
          type="button"
          className="flex min-w-0 flex-1 items-center rounded-full px-2 py-1.5 text-left transition-colors hover:bg-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={t('mobile.sessions.openSheetAria')}
          onClick={onOpenSessions}
          style={{ touchAction: 'manipulation' }}
        >
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="block truncate typography-ui-label text-foreground">{primaryLabel}</span>
            {secondaryLabel ? (
              <span className="block truncate typography-micro text-muted-foreground">{secondaryLabel}</span>
            ) : null}
          </span>
        </button>

        <button
          type="button"
          className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-interactive-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label={t('mobile.header.openMenuAria')}
          onClick={onOpenMenu}
          style={{ touchAction: 'manipulation' }}
        >
          <RiMore2Line className="size-5" />
        </button>
      </div>
    </header>
  );
};

const MobileShell: React.FC = () => {
  const { t } = useI18n();
  const [sessionsSheetOpen, setSessionsSheetOpen] = React.useState(false);
  const [sessionsSheetDragX, setSessionsSheetDragX] = React.useState<number | null>(null);
  const [filesOpen, setFilesOpen] = React.useState(false);
  const [changesOpen, setChangesOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [overflowOpen, setOverflowOpen] = React.useState(false);
  const sessionsCloseSwipeRef = React.useRef({ x: 0, y: 0, active: false, dragging: false });
  const [isTransitioning, setIsTransitioning] = React.useState(false);
  const isTransitioningRef = React.useRef(false);
  const transitionTimerRef = React.useRef<number | null>(null);
  const edgeTouchRef = React.useRef({ active: false, decided: false });
  const sessionsSheetOpenRef = React.useRef(false);
  const savedScrollRef = React.useRef(0);
  const edgeScrollDecideRef = React.useRef<(deltaY: number, deltaX: number) => void>(() => {});

  React.useEffect(() => {
    sessionsSheetOpenRef.current = sessionsSheetOpen;
  }, [sessionsSheetOpen]);

  React.useEffect(() => {
    const ANDROID_BACK_MARGIN = 20;

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      if (touch.clientX <= ANDROID_BACK_MARGIN) {
        edgeTouchRef.current = { active: false, decided: false };
        return;
      }
      if (touch.clientX <= window.innerWidth * 0.15) {
        edgeTouchRef.current = { active: true, decided: false };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!edgeTouchRef.current.active || edgeTouchRef.current.decided) return;
      e.preventDefault();
    };

    const onTouchEnd = () => {
      edgeTouchRef.current = { active: false, decided: false };
    };

    const decideScroll = (deltaY: number, deltaX: number) => {
      if (!edgeTouchRef.current.active || edgeTouchRef.current.decided) return;
      if (Math.abs(deltaY) > 10 && Math.abs(deltaY) > Math.abs(deltaX)) {
        edgeTouchRef.current.decided = true;
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false, capture: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true, capture: true });
    document.addEventListener('touchcancel', onTouchEnd, { passive: true, capture: true });

    edgeScrollDecideRef.current = decideScroll;

    return () => {
      document.removeEventListener('touchstart', onTouchStart, { capture: true });
      document.removeEventListener('touchmove', onTouchMove, { capture: true });
      document.removeEventListener('touchend', onTouchEnd, { capture: true });
      document.removeEventListener('touchcancel', onTouchEnd, { capture: true });
    };
  }, []);

  const lockScroll = React.useCallback(() => {
    savedScrollRef.current = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${savedScrollRef.current}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
  }, []);

  const unlockScroll = React.useCallback(() => {
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    document.body.style.overflow = '';
    window.scrollTo(0, savedScrollRef.current);
  }, []);

  const beginTransition = React.useCallback(() => {
    if (transitionTimerRef.current) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
    isTransitioningRef.current = true;
    setIsTransitioning(true);
    lockScroll();
  }, [lockScroll]);

  const endTransition = React.useCallback(() => {
    if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = window.setTimeout(() => {
      isTransitioningRef.current = false;
      setIsTransitioning(false);
      unlockScroll();
      transitionTimerRef.current = null;
    }, 250);
  }, [unlockScroll]);

  React.useEffect(() => {
    return () => {
      if (transitionTimerRef.current) window.clearTimeout(transitionTimerRef.current);
      isTransitioningRef.current = false;
      unlockScroll();
    };
  }, [unlockScroll]);

  // When set, the Changes surface opens directly into the per-file diff for this path.
  const [pendingChangesDiff, setPendingChangesDiff] = React.useState<{ path: string; staged: boolean } | null>(null);
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);
  const gitStatus = useGitStatus(normalizePath(currentDirectory) || null);
  const dirtyChangeCount = gitStatus?.files?.length ?? 0;
  const sessionsDrawerWidth = typeof window === 'undefined' ? 390 : window.innerWidth;
  const sessionsDrawerProgress = sessionsSheetOpen
    ? sessionsSheetDragX === null
      ? 1
      : Math.max(0, Math.min(1, 1 + sessionsSheetDragX / sessionsDrawerWidth))
    : 0;
  const chatCardProgress = sessionsDrawerProgress;
  const chatCardOffset = typeof window === 'undefined' ? 390 : window.innerWidth;
  const sessionsPanelOffset = 0;

  const mobileActions = React.useMemo<MobileAppActions>(
    () => ({
      openChanges: ({ diffPath, staged } = {}) => {
        setPendingChangesDiff(diffPath ? { path: diffPath, staged: staged === true } : null);
        setChangesOpen(true);
      },
      openFiles: () => setFilesOpen(true),
      openSettings: () => setSettingsOpen(true),
    }),
    [],
  );

  const closeChanges = React.useCallback(() => {
    setChangesOpen(false);
    setPendingChangesDiff(null);
  }, []);

  const isInsideHorizontalScroller = (target: EventTarget | null): boolean => {
    let el = target as HTMLElement | null;
    while (el && el !== document.body) {
      const style = window.getComputedStyle(el);
      const overflowX = style.overflowX;
      if ((overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) {
        return true;
      }
      el = el.parentElement;
    }
    return false;
  };

  const handleChatCardTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!sessionsSheetOpen) return;
    if (isInsideHorizontalScroller(event.target)) return;
    const touch = event.touches[0];
    if (!touch) return;
    sessionsCloseSwipeRef.current = { x: touch.clientX, y: touch.clientY, active: true, dragging: false };
  };

  const handleChatCardTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const swipe = sessionsCloseSwipeRef.current;
    if (!sessionsSheetOpen || !swipe.active) return;
    const touch = event.touches[0];
    if (!touch) return;

    const deltaX = touch.clientX - swipe.x;
    const deltaY = touch.clientY - swipe.y;
    const hasHorizontalIntent = deltaX < -10 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25;

    if (edgeTouchRef.current.active && !edgeTouchRef.current.decided) {
      edgeScrollDecideRef.current(deltaY, deltaX);
    }

    if (!swipe.dragging) {
      if (!hasHorizontalIntent) return;
      swipe.dragging = true;
      beginTransition();

    }

    event.preventDefault();
    setSessionsSheetDragX(Math.max(-sessionsDrawerWidth, Math.min(0, deltaX)));
  };

  const handleChatCardTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const swipe = sessionsCloseSwipeRef.current;
    sessionsCloseSwipeRef.current = { x: 0, y: 0, active: false, dragging: false };
    if (!sessionsSheetOpen || !swipe.active) return;

    const touch = event.changedTouches[0];
    if (!touch || !swipe.dragging) {
      setSessionsSheetDragX(null);

      endTransition();
      return;
    }

    const deltaX = touch.clientX - swipe.x;
    const deltaY = touch.clientY - swipe.y;
    const shouldClose = deltaX <= -56 && Math.abs(deltaX) > Math.abs(deltaY) * 1.25;

    if (shouldClose) {
      setSessionsSheetOpen(false);
    }
    setSessionsSheetDragX(null);

    endTransition();
  };

  React.useEffect(() => {
    if (filesOpen || changesOpen || settingsOpen || overflowOpen) return;

    const ANDROID_BACK_MARGIN = 20;
    const edgeThreshold = window.innerWidth * 0.85;
    const minSwipeDistance = 56;
    const horizontalIntentRatio = 1.25;
    const touchStart = { x: 0, y: 0, active: false, dragging: false };

    const isInsideHorizontalScroller = (target: EventTarget | null): boolean => {
      let el = target as HTMLElement | null;
      while (el && el !== document.body) {
        const style = window.getComputedStyle(el);
        const overflowX = style.overflowX;
        if ((overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) {
          return true;
        }
        el = el.parentElement;
      }
      return false;
    };

    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || touch.clientX <= ANDROID_BACK_MARGIN || touch.clientX > edgeThreshold || sessionsSheetOpenRef.current) {
        touchStart.active = false;
        return;
      }

      if (isInsideHorizontalScroller(event.target)) {
        touchStart.active = false;
        return;
      }

      touchStart.x = touch.clientX;
      touchStart.y = touch.clientY;
      touchStart.active = true;
      touchStart.dragging = false;
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (!touchStart.active) return;
      const touch = event.touches[0];
      if (!touch) return;

      const deltaX = touch.clientX - touchStart.x;
      const deltaY = touch.clientY - touchStart.y;
      const hasHorizontalIntent = deltaX > 10 && Math.abs(deltaX) > Math.abs(deltaY) * horizontalIntentRatio;

      if (edgeTouchRef.current.active && !edgeTouchRef.current.decided) {
        edgeScrollDecideRef.current(deltaY, deltaX);
      }

      if (!touchStart.dragging) {
        if (!hasHorizontalIntent) return;
        touchStart.dragging = true;
        beginTransition();
        setSessionsSheetOpen(true);
      }

      event.preventDefault();
      setSessionsSheetDragX(Math.min(0, -sessionsDrawerWidth + Math.max(0, deltaX)));
    };

    const finishSwipe = (event?: TouchEvent) => {
      if (!touchStart.active) return;
      const wasDragging = touchStart.dragging;
      touchStart.active = false;
      touchStart.dragging = false;

      const touch = event?.changedTouches[0];
      if (!touch || !wasDragging) {
        setSessionsSheetDragX(null);
  
        endTransition();
        return;
      }

      const deltaX = touch.clientX - touchStart.x;
      const deltaY = touch.clientY - touchStart.y;
      const shouldOpen = deltaX >= minSwipeDistance && Math.abs(deltaX) > Math.abs(deltaY) * horizontalIntentRatio;

      if (shouldOpen) {
        setSessionsSheetDragX(null);
      } else {
        setSessionsSheetOpen(false);
        setSessionsSheetDragX(null);
      }

      endTransition();
    };

    const handleTouchCancel = () => {
      finishSwipe();
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true, capture: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: false, capture: true });
    document.addEventListener('touchend', finishSwipe, { passive: true, capture: true });
    document.addEventListener('touchcancel', handleTouchCancel, { passive: true, capture: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart, { capture: true });
      document.removeEventListener('touchmove', handleTouchMove, { capture: true });
      document.removeEventListener('touchend', finishSwipe, { capture: true });
      document.removeEventListener('touchcancel', handleTouchCancel, { capture: true });
    };
  }, [beginTransition, endTransition, changesOpen, filesOpen, overflowOpen, sessionsDrawerWidth, settingsOpen]);

  const overflowItems: OverflowItem[] = React.useMemo(
    () => [
      {
        key: 'files',
        Icon: RiFileTextLine,
        label: t('mobile.menu.files'),
        onSelect: () => setFilesOpen(true),
      },
      {
        key: 'changes',
        Icon: RiGitBranchLine,
        label: t('mobile.menu.changes'),
        badge: dirtyChangeCount,
        onSelect: () => setChangesOpen(true),
      },
      {
        key: 'settings',
        Icon: RiSettings3Line,
        label: t('mobile.menu.settings'),
        onSelect: () => setSettingsOpen(true),
      },
    ],
    [dirtyChangeCount, t],
  );

  return (
    <DedicatedMobileAppProvider actions={mobileActions}>
      <div
        className="main-content-safe-area flex h-[100dvh] flex-col bg-background text-foreground"
        data-page-scroll-lock="true"
      >
        <div
          className={cn(
            'relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background',
            sessionsSheetOpen ? 'z-[60]' : 'z-10',
          )}
          style={{
            willChange: isTransitioning ? 'transform' : undefined,
            transform: `translateX(${chatCardProgress * chatCardOffset}px) scale(${1 - chatCardProgress * 0.025})`,
            borderRadius: chatCardProgress > 0 ? `${chatCardProgress * 18}px` : undefined,
            boxShadow: chatCardProgress > 0
              ? `0 18px 60px rgb(0 0 0 / ${0.12 + chatCardProgress * 0.18})`
              : undefined,
            transition: sessionsSheetDragX === null
              ? 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 220ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 220ms ease-out'
              : 'none',
          }}
          onTouchStart={handleChatCardTouchStart}
          onTouchMove={handleChatCardTouchMove}
          onTouchEnd={handleChatCardTouchEnd}
          onTouchCancel={handleChatCardTouchEnd}
        >
          <MobileHeader
            onOpenSessions={() => setSessionsSheetOpen(true)}
            onOpenMenu={() => setOverflowOpen(true)}
          />
          <main
            className="relative min-h-0 flex-1 overflow-hidden"
            data-page-scroll-lock="true"
          >
            <ErrorBoundary>
              <ChatView />
            </ErrorBoundary>
          </main>
        </div>

        <MobileOverflowMenu
          open={overflowOpen}
          onClose={() => setOverflowOpen(false)}
          items={overflowItems}
        />

        {sessionsSheetOpen ? (
          <MobileSessionsSheet
            open={sessionsSheetOpen}
            onOpenChange={(open) => {
              setSessionsSheetOpen(open);
              if (!open) setSessionsSheetDragX(null);
            }}
            revealProgress={sessionsDrawerProgress}
            panelOffsetX={sessionsPanelOffset}
            isTransitioning={isTransitioning}
            onPanelTouchStart={handleChatCardTouchStart}
            onPanelTouchMove={handleChatCardTouchMove}
            onPanelTouchEnd={handleChatCardTouchEnd}
          />
        ) : null}

        {/* Mounted only while open (like the sessions sheet) so each surface
            computes its safe-area / fixed-position layout fresh on open. Keeping
            them always-mounted left a stale startup layout, which made the
            top-inset dimming appear only intermittently on iOS. */}
        {filesOpen ? (
          <MobileSurfaceShell
            open
            onClose={() => setFilesOpen(false)}
            ariaLabel={t('mobile.menu.files')}
            headerless
          >
            <ErrorBoundary>
              <MobileFilesSurface onClose={() => setFilesOpen(false)} />
            </ErrorBoundary>
          </MobileSurfaceShell>
        ) : null}

        {changesOpen ? (
          <MobileSurfaceShell
            open
            onClose={closeChanges}
            ariaLabel={t('mobile.menu.changes')}
            headerless
          >
            <ErrorBoundary>
              <MobileChangesSurface
                onClose={closeChanges}
                initialDiffPath={pendingChangesDiff?.path ?? null}
                initialDiffStaged={pendingChangesDiff?.staged === true}
              />
            </ErrorBoundary>
          </MobileSurfaceShell>
        ) : null}

        {settingsOpen ? (
          <MobileSurfaceShell
            open
            onClose={() => setSettingsOpen(false)}
            ariaLabel={t('mobile.menu.settings')}
            headerless
          >
            <ErrorBoundary>
              <SettingsView
                forceMobile
                isWindowed
                visiblePageSlugs={[...MOBILE_SETTINGS_PAGES]}
                onClose={() => setSettingsOpen(false)}
              />
            </ErrorBoundary>
          </MobileSurfaceShell>
        ) : null}
      </div>
    </DedicatedMobileAppProvider>
  );
};

export function MobileApp({ apis }: MobileAppProps) {
  const initializeApp = useConfigStore((state) => state.initializeApp);
  const isInitialized = useConfigStore((state) => state.isInitialized);
  const isConnected = useConfigStore((state) => state.isConnected);
  const providersCount = useConfigStore((state) => state.providers.length);
  const agentsCount = useConfigStore((state) => state.agents.length);
  const loadProviders = useConfigStore((state) => state.loadProviders);
  const loadAgents = useConfigStore((state) => state.loadAgents);
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);
  const error = useSessionUIStore((state) => state.error);
  const clearError = useSessionUIStore((state) => state.clearError);
  const setIsMobile = useUIStore((state) => state.setIsMobile);
  const refreshGitHubAuthStatus = useGitHubAuthStore((state) => state.refreshStatus);
  const setPlanModeEnabled = useFeatureFlagsStore((state) => state.setPlanModeEnabled);
  const projects = useProjectsStore((state) => state.projects);

  React.useEffect(() => {
    registerRuntimeAPIs(apis);
    return () => registerRuntimeAPIs(null);
  }, [apis]);

  React.useEffect(() => {
    setIsMobile(true);
  }, [setIsMobile]);

  React.useEffect(() => {
    void initializeApp();
  }, [initializeApp]);

  React.useEffect(() => {
    if (!isConnected) return;
    if (providersCount === 0) void loadProviders({ source: 'mobileApp:recovery' });
    if (agentsCount === 0) void loadAgents({ source: 'mobileApp:recovery' });
  }, [agentsCount, isConnected, loadAgents, loadProviders, providersCount]);

  React.useEffect(() => {
    if (!isConnected) return;
    opencodeClient.setDirectory(currentDirectory);
  }, [currentDirectory, isConnected]);

  React.useEffect(() => {
    void refreshGitHubAuthStatus(apis.github, { force: true });
  }, [apis.github, refreshGitHubAuthStatus]);

  // Discover all worktrees for every known project so the draft session's
  // worktree/branch dropdown can list every available branch — not only the
  // current one. Mirrors ElectronMiniChatApp + desktop SessionSidebar.
  React.useEffect(() => {
    if (projects.length === 0) return;
    let cancelled = false;

    const run = async () => {
      const worktreesByProject = new Map<string, WorktreeMetadata[]>();
      const allWorktrees: WorktreeMetadata[] = [];

      await Promise.all(
        projects.map(async (project) => {
          const projectPath = project.path.replace(/\\/g, '/').replace(/\/+$/, '');
          if (!projectPath) return;
          try {
            const cachedIsGitRepo = useGitStore.getState().directories.get(projectPath)?.isGitRepo;
            const isGitRepo =
              cachedIsGitRepo ?? (await import('@/lib/gitApi').then((m) => m.checkIsGitRepository(projectPath)));
            if (!isGitRepo) return;
            const worktrees = await listProjectWorktrees({ id: project.id, path: projectPath });
            if (cancelled || worktrees.length === 0) return;
            worktreesByProject.set(projectPath, worktrees);
            allWorktrees.push(...worktrees);
          } catch {
            // Worktree discovery is best-effort; draft selector falls back to the project root.
          }
        }),
      );

      if (cancelled) return;
      useSessionUIStore.setState({
        availableWorktrees: allWorktrees,
        availableWorktreesByProject: worktreesByProject,
      });
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [projects]);

  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const res = await runtimeFetch('/health', { method: 'GET' }).catch(() => null);
      if (!res || !res.ok || cancelled) return;
      const data = (await res.json().catch(() => null)) as null | { planModeExperimentalEnabled?: unknown };
      if (!data || cancelled) return;
      const raw = data.planModeExperimentalEnabled;
      setPlanModeEnabled(raw === true || raw === 1 || raw === '1' || raw === 'true');
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [setPlanModeEnabled]);

  React.useEffect(() => {
    if (!error) return;
    const timeout = window.setTimeout(() => clearError(), 5000);
    return () => window.clearTimeout(timeout);
  }, [clearError, error]);

  useAppFontEffects();
  usePushVisibilityBeacon({ enabled: true });
  useWindowTitle();
  useRouter();

  return (
    <ErrorBoundary>
      <SyncProvider sdk={opencodeClient.getSdkClient()} directory={currentDirectory || ''}>
        <RuntimeAPIProvider apis={apis}>
          <TooltipProvider delayDuration={300} skipDelayDuration={150}>
            <div className="h-full bg-background text-foreground">
              <SyncAppEffects embeddedBackgroundWorkEnabled={isInitialized} />
              <MobileShell />
              <Toaster />
            </div>
          </TooltipProvider>
        </RuntimeAPIProvider>
      </SyncProvider>
    </ErrorBoundary>
  );
}
