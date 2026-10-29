import { platformAdminEnvironment } from "./platform-admin-environment.js";

export function platformDocumentEnvironment(environment) {
  return platformAdminEnvironment(environment);
}

export function platformDocumentPathname(pathname, name) {
  return (name === "preview" || name === "production")
    && typeof pathname === "string"
    && /^platform-documents\/[0-9a-f-]{36}\.pdf$/i.test(pathname);
}

export function platformDocumentCatalogAllowed(name, accessKind) {
  return name === "preview" || (name === "production" && ["verified", "discovery"].includes(accessKind));
}
