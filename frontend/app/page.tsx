import { redirect } from "next/navigation";

export default function HomePage() {
  // Currently, Give Me Pic has no public landing page.
  // We redirect users directly to the login flow.
  redirect("/login");
}