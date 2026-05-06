import { Box, CircularProgress } from "@mui/material";
import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { RootLayout } from "./RootLayout";

const AuthPage = lazy(async () => import("../routes/AuthPage").then((module) => ({ default: module.AuthPage })));
const AppPage = lazy(async () => import("../routes/AppPage").then((module) => ({ default: module.AppPage })));

function RouteLoader() {
  return (
    <Box sx={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
      <CircularProgress size={26} />
    </Box>
  );
}

function AuthPageRoute() {
  return (
    <Suspense fallback={<RouteLoader />}>
      <AuthPage />
    </Suspense>
  );
}

function AppPageRoute() {
  return (
    <Suspense fallback={<RouteLoader />}>
      <AppPage />
    </Suspense>
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: AuthPageRoute,
});

const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app",
  component: AppPageRoute,
});

const routeTree = rootRoute.addChildren([indexRoute, appRoute]);

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
