import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export function NoFitBanner({ fitReason }: { fitReason?: string }) {
  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden>
            ⚠️
          </span>
          <div>
            <CardTitle>This application is not competitive</CardTitle>
            <CardDescription className="mt-1">
              Automated screening determined your background does not meet the minimum requirements
              for this role.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <Separator />
      <CardContent className="pt-5 space-y-4">
        {fitReason && (
          <p className="text-base text-amber-300/90 leading-relaxed">{fitReason}</p>
        )}
        <p className="text-sm text-muted-foreground">
          A tailored CV and cover letter were not generated because submitting this application
          would be unlikely to progress. Review the gap analysis below for steps you can take to
          become a competitive candidate for similar roles.
        </p>
      </CardContent>
    </Card>
  );
}
