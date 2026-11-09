import Link from "next/link";
export default function NotFound() {
  return (
    <main
      className="empty"
      style={{ minHeight: "100vh", justifyContent: "center" }}
    >
      <h1>Nie znaleziono strony</h1>
      <p>Sprawdź adres lub wróć do panelu przychodni.</p>
      <Link className="primary" href="/">
        Wróć do panelu
      </Link>
    </main>
  );
}
