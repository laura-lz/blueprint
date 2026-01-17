// import Calculator from "@/components/Calculator";
// import styles from "./page.module.css";

// /**
//  * Home page component
//  * Renders the calculator in a centered layout
//  */
// export default function Home() {
//   return (
//     <main className={styles.main}>
//       <h1 className={styles.title}>Calculator</h1>
//       <Calculator />
//     </main>
//   );
// }

"use client"; // <--- Important for Next.js!

import React from 'react';
import Visualizer from './Visualizer'; // Import your new component

export default function Home() {
  return (
    <main style={{ width: '100vw', height: '100vh' }}>
      <Visualizer />
    </main>
  );
}