using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ParkingApi.Data;
using ParkingApi.Models;

namespace ParkingApi.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ParkingsController : ControllerBase
    {
        private readonly ParkingContext _context;

        public ParkingsController(ParkingContext context)
        {
            _context = context;
        }

        // 1. Obține toate parcările (Accesibil oricui - șoferi și admini)
        [HttpGet]
        public async Task<ActionResult<IEnumerable<Parking>>> GetParkings()
        {
            return await _context.C_Parkings.ToListAsync();
        }

        // 2. Adaugă o parcare nouă (Protejat: doar pentru Admini)
        // [Authorize(Roles = "Admin")] // Decomentează când activezi complet JWT & Rolurile
        [HttpPost]
        public async Task<ActionResult<Parking>> PostParking(Parking parking)
        {
            _context.C_Parkings.Add(parking);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetParkings), new { id = parking.Id }, parking);
        }

        // 3. Șterge o parcare (Protejat: doar pentru Admini)
        // [Authorize(Roles = "Admin")] // Decomentează când activezi complet JWT & Rolurile
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteParking(int id)
        {
            var parking = await _context.C_Parkings.FindAsync(id);
            if (parking == null)
            {
                return NotFound();
            }

            _context.C_Parkings.Remove(parking);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        // 4. Rezervă un loc (Setează timpul de expirare de 30 de minute)
        [HttpPut("{id}/reserve")]
        public async Task<IActionResult> ReserveSpot(int id)
        {
            var parking = await _context.C_Parkings.FindAsync(id);
            if (parking == null) return NotFound();

            if (parking.AvailableSpots <= 0) return BadRequest("Parcarea este plina.");

            parking.AvailableSpots -= 1;
            parking.ReservationTime = DateTime.UtcNow; // Setează ora curentă UTC
            await _context.SaveChangesAsync();

            return Ok(parking);
        }

        // 5. Eliberează un loc de parcare (Resetează timpul)
        [HttpPut("{id}/release")]
        public async Task<IActionResult> ReleaseSpot(int id)
        {
            var parking = await _context.C_Parkings.FindAsync(id);
            if (parking == null)
            {
                return NotFound();
            }

            parking.AvailableSpots = Math.Min(parking.TotalSpots, parking.AvailableSpots + 1);
            parking.ReservationTime = null;
            await _context.SaveChangesAsync();

            return Ok(parking);
        }
    }
}