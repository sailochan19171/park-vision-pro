// Third-party module that ships no TS types — declare it so consuming files
// (e.g. MTDSummaryScreen's PDF export) type-check cleanly.
declare module 'react-native-html-to-pdf';

declare module '@nozbe/watermelondb/DatabaseProvider' {
  import { Database } from '@nozbe/watermelondb';
  import React from 'react';
  interface Props {
    database: Database;
    children: React.ReactNode;
  }
  const DatabaseProvider: React.FC<Props>;
  export default DatabaseProvider;
}
