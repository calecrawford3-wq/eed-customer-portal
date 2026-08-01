import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Wrench, Users, Receipt, Package } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardStats({ stats, isLoading }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-6 mb-6 md:mb-8">
      {stats.map((stat) => (
        <Link key={stat.label} to={createPageUrl(stat.page)}>
          <Card className="hover:shadow-lg transition-shadow cursor-pointer border-0 shadow-sm">
            <CardContent className="p-4 md:p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                  {isLoading ? (
                    <Skeleton className="h-9 w-16 mt-1" />
                  ) : (
                    <p className="text-2xl md:text-3xl font-bold text-slate-900 mt-1">{stat.value}</p>
                  )}
                </div>
                <div className={`${stat.color} p-3 rounded-xl`}>
                  <stat.icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}