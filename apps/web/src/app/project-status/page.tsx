import type { Metadata } from "next";
import ProjectStatusContent from "./ProjectStatusContent";

export const metadata: Metadata = {
  title: "Lets Chat Project Status",
  description:
    "Production-deployed full-stack chat app built with Next.js, NestJS, Prisma, PostgreSQL and Socket.io. Actively in development.",
  openGraph: {
    title: "Lets Chat Project Status",
    description:
      "Production-deployed full-stack chat app built with Next.js, NestJS, Prisma, PostgreSQL and Socket.io. Actively in development.",
  },
};

export default function ProjectStatusPage() {
  return <ProjectStatusContent />;
}
