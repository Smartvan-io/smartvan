export interface Version {
  tag: string;
  minHomeassistant: string;
}

export interface Versions {
  latestVersion: Version;
  currentVersion: Version;
  latestCompatibleVersion: Version;
  homeassistant: string;
  error?: string;
}
