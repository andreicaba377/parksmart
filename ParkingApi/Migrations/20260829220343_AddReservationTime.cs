using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ParkingApi.Migrations
{
    /// <inheritdoc />
    public partial class AddReservationTime : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "ReservationTime",
                table: "C_Parkings",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ReservationTime",
                table: "C_Parkings");
        }
    }
}
