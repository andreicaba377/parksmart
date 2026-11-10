using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using ParkingApi.Models; 

namespace ParkingApi.Data
{
    public class ParkingContext : IdentityDbContext<IdentityUser>
    {
        public ParkingContext(DbContextOptions<ParkingContext> options) : base(options)
        {
        }

        public DbSet<Parking> C_Parkings { get; set; }
    }
}