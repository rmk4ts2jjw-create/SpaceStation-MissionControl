import { Metadata } from "next";
import OfficeClient from "./client";

export const metadata: Metadata = {
  title: "The Office 3D | SpaceStation",
  description: "Visualise your agents working in real-time in a 3D environment",
};

export default function OfficePage() {
  return <OfficeClient />;
}
