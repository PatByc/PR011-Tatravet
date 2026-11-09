"use client";
export default function ErrorPage({
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  return (
    <main
      className="empty"
      style={{ minHeight: "100vh", justifyContent: "center" }}
    >
      <h1>Panel jest chwilowo niedostępny</h1>
      <p>
        Nie udało się wczytać danych. Spróbuj ponownie za chwilę. Jeśli problem
        się powtarza, skontaktuj się z opiekunem panelu.
      </p>
      <button className="primary" onClick={retry}>
        Spróbuj ponownie
      </button>
    </main>
  );
}
