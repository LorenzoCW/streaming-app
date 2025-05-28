// index.js
import Link from 'next/link';
import styles from '../styles/home.module.css';

export default function Home() {
  return (
    <div className={styles.container}>
      {/* <h1 className={styles.title}>Bem-vindo.</h1>*/}
      <div className={styles.poster}>
        <h1 className={styles.heading}>C I M E N A</h1>
        <div className={styles.buttons}>
          <Link href="/share">
            <button className={styles.btn}>Compartilhar</button>
          </Link>
          <Link href="/view">
            <button className={styles.btn}>Visualizar</button>
          </Link>
        </div>
      </div>
    </div>
  );
}