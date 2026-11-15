import type { Metadata } from "next";

import { StratoFalconApp } from "@/components/stratofalcon-app";

export const metadata: Metadata = {
  title: "StratoFalcon — flight deck",
};

export default function DemoPage() {
  return <StratoFalconApp />;
}
