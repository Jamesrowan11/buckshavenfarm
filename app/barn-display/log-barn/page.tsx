import BarnDisplayClient from "@/components/BarnDisplayClient";

export const dynamic = "force-dynamic";

export default function LogBarnDisplay() {
  return <BarnDisplayClient barnFilter="log-barn" barnLabel="LOG BARN" />;
}
