import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export function CompanyBriefCard({ companySummary }: { companySummary: string }) {
  return (
    <Card className="border-violet-500/30 bg-violet-500/5">
      <CardHeader className="pb-3">
        <CardTitle>Company & Role Brief</CardTitle>
        <CardDescription>
          Key things to keep in mind as you prepare your application and interviews.
        </CardDescription>
      </CardHeader>
      <Separator />
      <CardContent className="pt-5">
        <p className="text-base text-muted-foreground leading-relaxed">{companySummary}</p>
      </CardContent>
    </Card>
  );
}
